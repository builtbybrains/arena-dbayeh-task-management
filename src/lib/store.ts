"use client";

import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { t } from "./i18n";
import { create } from "zustand";
import * as engine from "./engine";
import { DomainError, type NewTaskInput } from "./engine";
import * as venue from "./venue-engine";
import { createCloudRepository, emptyDb, sampleRepository, useSync, type DataRepository } from "./repository";
import { buildSeed, DB_VERSION } from "./seed";
import { canViewTask } from "./permissions";
import { idx } from "./selectors";
import { dateKey } from "./time";
import type { Database, EventStatus, Priority, RevenueEntry, User, Workspace } from "./types";
import { dueReminders } from "./venue";
import { ARENA, forViewer, mergeInto, scopeDb, userVenue, venuesOf } from "./scope";

/** "workspace" is the real, shared Arena data; "sample" is the fictional demo. */
export type Mode = "workspace" | "sample";

const MODE_KEY = "arena-os-mode-v1";
const PROFILE_KEY = "arena-os-profile-v1"; // sample: per tab, so two tabs can show two roles
const DEVICE_USER_KEY = "arena-os-device-user-v1"; // workspace: this phone stays signed in
const PREFS_KEY = "arena-os-prefs-v1";

interface AppState {
  ready: boolean;
  mode: Mode | null;
  db: Database | null;
  userId: string | null;
  /** The venue an Owner is looking at; everyone else is fixed to their own. */
  venue: string;
  switchingTo: string | null;
  effects: "auto" | "off";
}

export const useApp = create<AppState>(() => ({
  ready: false,
  mode: null,
  db: null,
  userId: null,
  venue: ARENA,
  switchingTo: null,
  effects: "auto",
}));

const VENUE_KEY = "arena-os-venue-v1";

let repo: DataRepository = sampleRepository;
let cloud: ReturnType<typeof createCloudRepository> | null = null;

// --- Clock -------------------------------------------------------------------
// One shared ticker. Timers read timestamps, so a sleeping tab or a refresh
// never loses time; the ticker only decides when to repaint.

const fastListeners = new Set<() => void>();
const slowListeners = new Set<() => void>();
let fastNow = 0;
let slowNow = 0;
let clockStarted = false;

function touchClock(notify = true) {
  fastNow = slowNow = Date.now();
  if (notify) {
    fastListeners.forEach((l) => l());
    slowListeners.forEach((l) => l());
  }
}

function startClock() {
  if (clockStarted || typeof window === "undefined") return;
  clockStarted = true;
  touchClock(false);
  setInterval(() => {
    fastNow = Date.now();
    fastListeners.forEach((l) => l());
    if (fastNow - slowNow >= 20_000) {
      slowNow = fastNow;
      slowListeners.forEach((l) => l());
    }
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) touchClock();
  });
}

/** Current time. `fast` repaints every second (live timers); otherwise every 20s. */
export function useNow(fast = false): number {
  const subscribe = useCallback(
    (cb: () => void) => {
      startClock();
      const set = fast ? fastListeners : slowListeners;
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    [fast],
  );
  return useSyncExternalStore(
    subscribe,
    () => {
      startClock();
      return fast ? fastNow : slowNow;
    },
    () => 0,
  );
}

// --- Boot / mode / profile -------------------------------------------------

const read = (store: "local" | "session", k: string): string | null => {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(k);
  } catch {
    return null;
  }
};
const write = (store: "local" | "session", k: string, v: string | null) => {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (v === null) s.removeItem(k);
    else s.setItem(k, v);
  } catch {
    // storage blocked
  }
};

let timersStarted = false;
let unsubscribe: (() => void) | null = null;

export function boot() {
  if (useApp.getState().ready) return;
  const effects: AppState["effects"] = read("local", PREFS_KEY) === "off" ? "off" : "auto";
  useApp.setState({ effects, venue: read("local", VENUE_KEY) || ARENA });
  const mode = read("local", MODE_KEY) as Mode | null;
  if (mode === "sample" || mode === "workspace") void enterMode(mode);
  else useApp.setState({ ready: true, mode: null, db: null, userId: null });
  if (!timersStarted) {
    timersStarted = true;
    // Any change, from this tab or another device, may carry a new alert.
    useApp.subscribe((s, prev) => {
      if (s.db && (s.db !== prev.db || s.userId !== prev.userId)) announce(s.db);
    });
    setInterval(tick, 10_000);
  }
}

/** Time-driven writes: overdue / over-time alerts, today's recurring tasks, venue structure. */
function tick() {
  const cur = useApp.getState().db;
  if (!cur || cur.users.length === 0) return;
  const now = Date.now();
  const next = venue.ensureStructure(venue.generateRecurring(engine.syncAlerts(cur, now), now));
  if (next !== cur) {
    useApp.setState({ db: next });
    repo.save(next, cur);
  }
  announce(next);
}

/** Open the sample demo or the real workspace on this device. */
export async function enterMode(mode: Mode) {
  write("local", MODE_KEY, mode);
  unsubscribe?.();
  const now = Date.now();
  if (mode === "sample") {
    repo = sampleRepository;
    let db = repo.load();
    // Fresh sample data on first visit and each business day, so the venue always looks mid-shift.
    if (!db || db.version !== DB_VERSION || dateKey(db.seeded_at) !== dateKey(now)) {
      db = buildSeed(now);
      repo.save(db, null);
    }
    db = venue.generateRecurring(engine.syncAlerts(db, now), now);
    markSeen(db);
    let userId = read("session", PROFILE_KEY);
    if (userId && !db.users.some((u) => u.id === userId)) userId = null;
    useApp.setState({ ready: true, mode, db, userId });
  } else {
    cloud ??= createCloudRepository(DB_VERSION);
    repo = cloud;
    const cached = cloud.load();
    const hasData = !!cached && cached.users.length > 0;
    let userId = read("local", DEVICE_USER_KEY);
    if (userId && !cached?.users.some((u) => u.id === userId && u.active_status)) userId = hasData ? null : userId;
    markSeen(cached ?? emptyDb(DB_VERSION));
    // With a saved copy the app opens at once and syncs in the background.
    useApp.setState({ ready: hasData, mode, db: cached ?? emptyDb(DB_VERSION), userId: hasData ? userId : null });
    await cloud.start();
    const db = cloud.load() ?? emptyDb(DB_VERSION);
    if (userId && !db.users.some((u) => u.id === userId && u.active_status)) userId = null;
    useApp.setState({ ready: true, db, userId: useApp.getState().userId ?? userId });
  }
  unsubscribe = repo.subscribe((next) => {
    const { userId } = useApp.getState();
    // Signed out remotely (removed or deactivated): back to the sign-in screen.
    const still = !userId || next.users.some((u) => u.id === userId && u.active_status);
    useApp.setState({ db: next, ...(still ? {} : { userId: null }) });
    if (!still) write("local", DEVICE_USER_KEY, null);
  });
}

/** Leave the current mode and go back to the start screen. */
export function leaveMode() {
  unsubscribe?.();
  unsubscribe = null;
  write("local", MODE_KEY, null);
  write("session", PROFILE_KEY, null);
  useApp.setState({ mode: null, db: null, userId: null, ready: true });
}

export const syncNow = () => cloud?.pullNow();

// --- PINs ------------------------------------------------------------------------

/** Not real security: it keeps colleagues out of each other's screens. */
export async function hashPin(userId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`arena-os:${userId}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const validPin = (pin: string) => /^\d{4}$/.test(pin);

/** Check a PIN and sign this device in. */
export async function signInWithPin(userId: string, pin: string): Promise<boolean> {
  const db = useApp.getState().db;
  const u = db?.users.find((x) => x.id === userId && x.active_status);
  if (!u) return false;
  if (u.pin_hash && (await hashPin(u.id, pin)) !== u.pin_hash) return false;
  switchProfile(u.id);
  return true;
}

/** First run: create the Owner and the departments. */
export async function setupWorkspace(input: { venue: string; ownerName: string; pin: string }): Promise<boolean> {
  const { db } = useApp.getState();
  if (!db) return false;
  if (!validPin(input.pin)) {
    toast.error(t("Choose a 4-digit PIN."));
    return false;
  }
  const ownerId = engine.uid("u");
  const pinHash = await hashPin(ownerId, input.pin);
  try {
    const next = venue.setupWorkspace(db, Date.now(), { name: input.venue, ownerId, ownerName: input.ownerName, pinHash });
    useApp.setState({ db: next });
    repo.save(next, db);
    switchProfile(ownerId);
    return true;
  } catch (e) {
    if (e instanceof DomainError) {
      toast.error(t(e.message));
      return false;
    }
    throw e;
  }
}

// --- Alerts and reminders --------------------------------------------------------

const SEEN_KEY = "arena-os-seen-v1";
let seen: Set<string> | null = null;
const seenSet = () => {
  if (!seen) {
    try {
      seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
    } catch {
      seen = new Set();
    }
  }
  return seen;
};
const saveSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet()].slice(-600)));
  } catch {
    // storage full
  }
};

/** Mark everything already there as seen, so opening the app does not replay old alerts. */
function markSeen(db: Database) {
  const s = seenSet();
  for (const l of db.logs) if (l.action === "over_time") s.add(`${l.id}`);
  saveSeen();
}

/** Ask the browser for permission to show notifications outside the tab. */
export async function enableBrowserNotifications(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

function notifyBrowser(title: string, body: string, tag: string, link?: string | null) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const n = new Notification(title, { body, tag, icon: "/icon.svg" });
      if (link) n.onclick = () => window.open(link, "_blank", "noopener");
    }
  } catch {
    // Some phones only allow notifications from an installed app.
  }
}

/**
 * Pops a notification the first time this device sees a "ran over its time
 * allowed" entry for a task the signed-in person may see, or a reminder that
 * has come due for them.
 */
function announce(db: Database) {
  const { userId } = useApp.getState();
  const i = idx(db);
  const me = userId ? i.userById.get(userId) : undefined;
  if (!me) return;
  const s = seenSet();
  let changed = false;
  for (const l of db.logs) {
    if (l.action !== "over_time" || s.has(l.id)) continue;
    s.add(l.id);
    changed = true;
    const task = l.task_id ? i.taskById.get(l.task_id) : undefined;
    if (!task || task.status === "completed" || !canViewTask(me, task)) continue;
    if (Date.now() - Date.parse(l.created_at) > 60 * 60_000) continue;
    if (task.assigned_to === me.id) {
      const msg = t("You are over the {n} min allowed for “{task}”.", { n: l.new_value ?? "", task: task.title });
      toast.warning(msg, { duration: 8000 });
      notifyBrowser(t("Over time"), msg, l.id);
    } else {
      const who = i.userById.get(l.actor_id)?.name ?? t("Someone");
      const msg = t("{name} is over the {n} min allowed.", { name: who, n: l.new_value ?? "" });
      toast.warning(msg, { description: task.title, duration: 8000 });
      notifyBrowser(msg, task.title, l.id);
    }
  }
  for (const r of dueReminders(db, me, Date.now())) {
    const k = `rem:${me.id}:${r.id}`;
    if (s.has(k)) continue;
    s.add(k);
    changed = true;
    if (Date.now() - r.at > 6 * 60 * 60_000) continue; // stale: shown in the bell only
    const link = r.reminder?.link;
    toast(r.title, {
      description: r.note || undefined,
      duration: link ? 30000 : 10000,
      action: link ? { label: t("Open post"), onClick: () => window.open(link, "_blank", "noopener") } : undefined,
    });
    notifyBrowser(r.title, r.note, r.id, link);
  }
  if (changed) saveSeen();
}

/** Start the animated hand-over to another demo profile. */
export function switchProfile(userId: string) {
  useApp.setState({ switchingTo: userId });
}

export function completeSwitch(userId: string) {
  if (useApp.getState().mode === "workspace") write("local", DEVICE_USER_KEY, userId);
  else write("session", PROFILE_KEY, userId);
  useApp.setState({ userId });
}

export const clearSwitch = () => useApp.setState({ switchingTo: null });

export function signOut() {
  write("session", PROFILE_KEY, null);
  write("local", DEVICE_USER_KEY, null);
  useApp.setState({ userId: null });
}

export function setEffects(effects: AppState["effects"]) {
  try {
    localStorage.setItem(PREFS_KEY, effects);
  } catch {
    // storage blocked
  }
  useApp.setState({ effects });
}

export function resetDemo() {
  if (useApp.getState().mode !== "sample") return;
  const now = Date.now();
  const db = venue.generateRecurring(engine.syncAlerts(buildSeed(now), now), now);
  markSeen(db);
  repo.save(db, null);
  touchClock(false);
  useApp.setState({ db });
  toast.success(t("Demo reset to the original sample data."));
}

/** Owner only: wipe the real workspace for everyone and start again. */
export async function eraseWorkspace(): Promise<boolean> {
  const { mode, db, userId } = useApp.getState();
  const me = db?.users.find((u) => u.id === userId);
  if (mode !== "workspace" || !cloud || me?.role !== "owner") return false;
  try {
    await cloud.erase();
    signOut();
    useApp.setState({ db: cloud.load() });
    toast.success(t("Workspace erased. Set it up again to start fresh."));
    return true;
  } catch (e) {
    toast.error(t(e instanceof Error ? e.message : "Could not erase the workspace."));
    return false;
  }
}

// --- Hooks -------------------------------------------------------------------

/** Which venue someone works in right now: their own, or the one an Owner picked. */
export function activeVenue(db: Database, user: User | undefined, picked: string): string {
  if (!user) return ARENA;
  const own = userVenue(user);
  if (own) return own;
  return venuesOf(db).some((v) => v.id === picked) ? picked : ARENA;
}

/** Everything the signed-in person may see, limited to their venue. Only call below the app shell. */
export function useDb(): Database {
  const db = useApp((s) => s.db);
  const userId = useApp((s) => s.userId);
  const picked = useApp((s) => s.venue);
  if (!db) throw new Error("Arena OS data has not loaded yet.");
  const me = userId ? idx(db).userById.get(userId) : undefined;
  const slice = scopeDb(db, activeVenue(db, me, picked));
  return me ? forViewer(slice, me) : slice;
}

/** Both venues at once. For Owners only (combined reports). */
export function useAllVenuesDb(): Database {
  const db = useApp((s) => s.db);
  const userId = useApp((s) => s.userId);
  if (!db) throw new Error("Arena OS data has not loaded yet.");
  const me = userId ? idx(db).userById.get(userId) : undefined;
  return me ? forViewer(db, me) : db;
}

export const useVenueId = () => useDb().scope_venue ?? ARENA;

/** Owners: switch the venue on screen. */
export function setVenue(id: string) {
  write("local", VENUE_KEY, id);
  useApp.setState({ venue: id });
}

/** The signed-in person. */
export function useMe(): User {
  const db = useDb();
  const id = useApp((s) => s.userId);
  const me = id ? idx(db).userById.get(id) : undefined;
  if (!me) throw new Error("No one is signed in.");
  return me;
}

// --- Actions -----------------------------------------------------------------

function commit(change: (db: Database, actor: User, now: number) => Database, success?: string): boolean {
  const { db, userId } = useApp.getState();
  const actor = db && userId ? idx(db).userById.get(userId) : undefined;
  if (!db || !actor) {
    toast.error(t("Sign in first."));
    return false;
  }
  try {
    // The action runs on the actor's venue only; its changes are merged back.
    const slice = scopeDb(db, activeVenue(db, actor, useApp.getState().venue));
    const changed = change(slice, actor, Date.now());
    const next = changed === slice ? db : mergeInto(db, slice, changed);
    if (next !== db) {
      touchClock(false);
      useApp.setState({ db: next });
      repo.save(next, db);
    }
    if (success) toast.success(t(success));
    return true;
  } catch (e) {
    if (e instanceof DomainError) {
      toast.error(t(e.message));
      return false;
    }
    throw e;
  }
}

export const actions = {
  createTask: (input: NewTaskInput) => commit((db, a, now) => engine.createTask(db, a, now, input)),
  startTask: (taskId: string, pauseCurrent = false) =>
    commit((db, a, now) => engine.startTask(db, a, now, taskId, pauseCurrent)),
  pauseTask: (taskId: string) => commit((db, a, now) => engine.pauseTask(db, a, now, taskId)),
  completeTask: (taskId: string, note?: string) =>
    commit((db, a, now) => engine.completeTask(db, a, now, taskId, note)),
  setCompletionNote: (taskId: string, note: string) =>
    commit((db, a, now) => engine.setCompletionNote(db, a, now, taskId, note), "Note saved."),
  reopenTask: (taskId: string) => commit((db, a, now) => engine.reopenTask(db, a, now, taskId), "Task reopened."),
  reassignTask: (taskId: string, userId: string) =>
    commit((db, a, now) => engine.reassignTask(db, a, now, taskId, userId), "Task reassigned."),
  delegateTask: (taskId: string, userId: string) =>
    commit((db, a, now) => engine.delegateTask(db, a, now, taskId, userId), "Task passed on."),
  changePriority: (taskId: string, priority: Priority) =>
    commit((db, a, now) => engine.changePriority(db, a, now, taskId, priority)),
  updateTask: (taskId: string, change: Parameters<typeof engine.updateTask>[4]) =>
    commit((db, a, now) => engine.updateTask(db, a, now, taskId, change), "Task updated."),
  removeTask: (taskId: string) => commit((db, a, now) => engine.removeTask(db, a, now, taskId), "Task removed."),
  reorderTasks: (orderedIds: string[]) => commit((db, a, now) => engine.reorderTasks(db, a, now, orderedIds)),
  escalateTask: (taskId: string, reason: string) =>
    commit((db, a, now) => engine.escalateTask(db, a, now, taskId, reason), "Escalated to the Operations Manager."),
  submitDailyReport: (deptId: string, date: string, notes: string) =>
    commit((db, a, now) => engine.submitDailyReport(db, a, now, deptId, date, notes), "Daily report submitted."),
  reviewDailyReport: (reportId: string) =>
    commit((db, a, now) => engine.reviewDailyReport(db, a, now, reportId), "Marked as reviewed."),
  submitExecutiveReport: (date: string, notes: string) =>
    commit((db, a, now) => engine.submitExecutiveReport(db, a, now, date, notes), "Daily venue report submitted."),

  // Venue
  createEvent: (input: venue.EventInput, prep: venue.PrepTaskInput[] = []) =>
    commit((db, a, now) => venue.createEvent(db, a, now, input, prep), prep.length ? "Event booked and tasks assigned." : "Event booked."),
  updateEvent: (id: string, input: venue.EventInput) => commit((db, a, now) => venue.updateEvent(db, a, now, id, input), "Event updated."),
  setEventStatus: (id: string, status: EventStatus) =>
    commit((db, a, now) => venue.setEventStatus(db, a, now, id, status), status === "cancelled" ? "Event cancelled." : "Event updated."),
  logWalkIn: (input: venue.WalkInInput) => commit((db, a, now) => venue.logWalkIn(db, a, now, input)),
  removeWalkIn: (id: string) => commit((db, a, now) => venue.removeWalkIn(db, a, now, id), "Walk-in removed."),
  setRevenue: (date: string, source: RevenueEntry["source"], amount: number, note = "") =>
    commit((db, a, now) => venue.setRevenue(db, a, now, date, source, amount, note), "Revenue saved."),
  createReminder: (input: venue.ReminderInput) => commit((db, a, now) => venue.createReminder(db, a, now, input), "Reminder set."),
  dismissReminder: (id: string) => commit((db, a) => venue.dismissReminder(db, a, id)),
  deleteReminder: (id: string) => commit((db, a, now) => venue.deleteReminder(db, a, now, id), "Reminder deleted."),
  saveRecurring: (input: venue.RecurringInput, id?: string) =>
    commit((db, a, now) => venue.saveRecurring(db, a, now, input, id), id ? "Schedule updated." : "Recurring task created."),
  setRecurringActive: (id: string, active: boolean) =>
    commit((db, a) => venue.setRecurringActive(db, a, id, active), active ? "Schedule resumed." : "Schedule paused."),
  deleteRecurring: (id: string) => commit((db, a, now) => venue.deleteRecurring(db, a, now, id), "Schedule deleted."),
  savePerson: async (input: Omit<venue.PersonInput, "pin_hash"> & { pin?: string }) => {
    const id = input.id ?? engine.uid("u");
    if (input.pin !== undefined && input.pin !== "" && !validPin(input.pin)) {
      toast.error(t("A PIN is exactly 4 digits."));
      return false;
    }
    const isNew = !input.id;
    // Sample profiles open without a PIN; a placeholder keeps the record complete.
    const pin = input.pin || (isNew && useApp.getState().mode === "sample" ? "0000" : "");
    const pin_hash = pin ? await hashPin(id, pin) : undefined;
    return commit(
      (db, a, now) => venue.savePerson(db, a, now, { ...input, id: isNew ? id : input.id, ...(pin_hash ? { pin_hash } : {}) }),
      isNew ? "Person added." : "Changes saved.",
    );
  },
  setPersonActive: (id: string, active: boolean) =>
    commit((db, a) => venue.setPersonActive(db, a, id, active), active ? "Person reactivated." : "Person deactivated."),
  saveInstagramWatch: (input: Parameters<typeof venue.saveInstagramWatch>[3]) =>
    commit((db, a, now) => venue.saveInstagramWatch(db, a, now, input), "Instagram alerts saved."),
  addDepartment: (name: string, parentId: string | null = null) =>
    commit((db, a) => venue.addDepartment(db, a, name, parentId), parentId ? "Section added." : "Department added."),
  renameDepartment: (id: string, name: string) => commit((db, a) => venue.renameDepartment(db, a, id, name), "Name saved."),
  updateWorkspace: (change: Partial<Pick<Workspace, "name" | "walkin_price_kid" | "walkin_price_adult">>) =>
    commit((db, a) => venue.updateWorkspace(db, a, change), "Settings saved."),
};

export const useSyncStatus = useSync;
