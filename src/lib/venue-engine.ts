// Write side for the venue: events, walk-ins, revenue, reminders, recurring
// tasks, people and departments. Same rules as engine.ts: pure functions that
// check permissions and return a new database.

import { entry, fail, uid } from "./engine";
import {
  canEditWalkIn,
  canEnterRevenue,
  canLogWalkIn,
  canManageEvents,
  canManagePeople,
  canManagePerson,
  canAssign,
  canManageRecurring,
  canDirect,
  remindableUsers,
} from "./permissions";
import { MAX_OWNERS } from "./business";
import { idx } from "./selectors";
import { addDays, beirutToUtc, dateKey, iso, ms } from "./time";
import type {
  Area,
  Database,
  Department,
  EventKind,
  EventStatus,
  Priority,
  RecurringTask,
  Reminder,
  Repeat,
  RevenueEntry,
  Role,
  Task,
  User,
  VenueEvent,
  WalkIn,
  Workspace,
} from "./types";
import { ROLE_RANK } from "./types";

const money = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);
const count = (n: number) => Math.max(0, Math.round(Number(n) || 0));

// --- Workspace and people ---------------------------------------------------

export const DEFAULT_DEPARTMENTS: Omit<Department, "manager_id">[] = [
  { id: "ops", name: "Operations", short: "OPS", description: "Opening, cleaning, maintenance and the daily floor.", display_order: 0 },
  { id: "restaurant", name: "Restaurant", short: "F&B", description: "Quatro restaurant: kitchen, waiters and service.", display_order: 1 },
  { id: "playground", name: "Playground", short: "PLAY", description: "Play areas, entry desk, safety and kids' activities.", display_order: 2 },
];

/** First run of a real workspace: the Owner and the three departments. */
export function setupWorkspace(db: Database, now: number, input: { name: string; ownerId: string; ownerName: string; pinHash: string }): Database {
  if (db.users.length > 0) fail("This workspace is already set up.");
  const name = input.ownerName.trim();
  if (name.length < 2) fail("Enter the Owner's name.");
  const owner: User = {
    id: input.ownerId,
    name,
    role: "owner",
    title: "Owner",
    department_id: null,
    manager_id: null,
    restaurant_id: null,
    avatar: "140",
    active_status: true,
    pin_hash: input.pinHash,
    phone: null,
    created_at: iso(now),
  };
  const workspace: Workspace = {
    id: "workspace",
    name: input.name.trim() || "Arena Dbayeh",
    created_at: iso(now),
    created_by: owner.id,
    walkin_price_kid: 0,
    walkin_price_adult: 0,
  };
  return {
    ...db,
    workspace,
    users: [owner],
    departments: DEFAULT_DEPARTMENTS.map((d) => ({ ...d, manager_id: null })),
    restaurants: [{ id: "quatro", name: "Quatro Restaurant", department_id: "restaurant", description: "Main dining room.", display_order: 0 }],
  };
}

export function updateWorkspace(db: Database, actor: User, change: Partial<Pick<Workspace, "name" | "walkin_price_kid" | "walkin_price_adult">>): Database {
  if (actor.role !== "owner" && actor.role !== "ops") fail("Only the Owner or Operations Manager can change venue settings.");
  if (!db.workspace) fail("Set up the workspace first.");
  return {
    ...db,
    workspace: {
      ...db.workspace!,
      ...change,
      walkin_price_kid: change.walkin_price_kid !== undefined ? money(change.walkin_price_kid) : db.workspace!.walkin_price_kid,
      walkin_price_adult: change.walkin_price_adult !== undefined ? money(change.walkin_price_adult) : db.workspace!.walkin_price_adult,
    },
  };
}

export interface PersonInput {
  id?: string;
  name: string;
  role: Role;
  title: string;
  department_id: string | null;
  restaurant_id?: string | null;
  phone?: string | null;
  pin_hash?: string | null; // set to change the PIN
}

/** Who a person reports to, from their role and department. */
function managerFor(db: Database, role: Role, deptId: string | null, selfId: string): string | null {
  const owner = db.users.find((u) => u.role === "owner" && u.active_status) ?? db.users.find((u) => u.role === "owner");
  const ops = db.users.find((u) => u.role === "ops" && u.active_status && u.id !== selfId);
  if (role === "owner") return null;
  if (role === "ops") return owner?.id ?? null;
  if (role === "manager") return ops?.id ?? owner?.id ?? null;
  const dept = deptId ? db.departments.find((d) => d.id === deptId) : undefined;
  return dept?.manager_id && dept.manager_id !== selfId ? dept.manager_id : (ops?.id ?? owner?.id ?? null);
}

/** Re-point every department's manager and everyone's reporting line. */
function rewire(db: Database): Database {
  const departments = db.departments.map((d) => {
    const m =
      d.id === "ops"
        ? db.users.find((u) => u.role === "ops" && u.active_status)
        : db.users.find((u) => u.role === "manager" && u.department_id === d.id && u.active_status);
    return { ...d, manager_id: m?.id ?? null };
  });
  const next = { ...db, departments };
  const users = db.users.map((u) => {
    const manager_id = managerFor(next, u.role, u.department_id, u.id);
    return manager_id === u.manager_id ? u : { ...u, manager_id };
  });
  return { ...next, users };
}

export function savePerson(db: Database, actor: User, now: number, input: PersonInput): Database {
  const existing = input.id ? db.users.find((u) => u.id === input.id) : undefined;
  if (!canManagePeople(actor) || !canManagePerson(actor, existing ?? null)) fail("You are not allowed to manage this person.");
  if (actor.role !== "owner" && ROLE_RANK[input.role] <= ROLE_RANK[actor.role]) fail("You can only add people below you.");
  const name = input.name.trim();
  if (name.length < 2) fail("Enter a name.");
  if (input.role === "owner" && existing?.role !== "owner") {
    if (actor.role !== "owner") fail("Only an owner can add an owner.");
    if (db.users.filter((u) => u.role === "owner" && u.active_status).length >= MAX_OWNERS) fail("There can be at most 4 owners.");
    if (existing?.mm_jobs?.length) fail("Take this person out of Money Mondo first. Owners see all of it anyway.");
  }
  if (existing?.role === "owner" && input.role !== "owner") fail("An owner stays an owner. Deactivate them instead.");
  const dept = input.role === "ops" || input.role === "owner" ? null : input.department_id;
  if ((input.role === "manager" || input.role === "employee") && !dept) fail("Choose a department.");
  if (input.role === "manager" && dept === "ops") fail("The Operations Manager runs Operations. Pick Restaurant or Playground.");
  if (input.role === "manager" && db.users.some((u) => u.role === "manager" && u.department_id === dept && u.active_status && u.id !== existing?.id))
    fail("This department already has a manager.");
  if (input.role === "ops" && db.users.some((u) => u.role === "ops" && u.active_status && u.id !== existing?.id))
    fail("There is already an Operations Manager.");
  if (!existing && !input.pin_hash) fail("Set a 4-digit PIN.");
  if (db.users.some((u) => u.id !== existing?.id && u.active_status && u.name.toLowerCase() === name.toLowerCase()))
    fail("Someone with this name already exists. Add a surname.");
  const title = input.title.trim() || ({ owner: "Owner", ops: "Operations Manager", manager: "Manager", employee: "Staff" } as const)[input.role];
  let users: User[];
  if (existing) {
    users = db.users.map((u) =>
      u.id === existing.id
        ? {
            ...u,
            name,
            role: input.role,
            title,
            department_id: dept,
            restaurant_id: dept === "restaurant" ? (input.restaurant_id ?? null) : null,
            phone: input.phone?.trim() || null,
            pin_hash: input.pin_hash ?? u.pin_hash,
          }
        : u,
    );
  } else {
    const person: User = {
      id: input.id ?? uid("u"),
      name,
      role: input.role,
      title,
      department_id: dept,
      manager_id: null,
      restaurant_id: dept === "restaurant" ? (input.restaurant_id ?? null) : null,
      avatar: String((db.users.length * 47 + 130) % 360),
      active_status: true,
      pin_hash: input.pin_hash ?? null,
      phone: input.phone?.trim() || null,
      created_at: iso(now),
      created_by: actor.id,
    };
    users = [...db.users, person];
  }
  return rewire({ ...db, users });
}

export function setPersonActive(db: Database, actor: User, userId: string, active: boolean): Database {
  const u = db.users.find((x) => x.id === userId);
  if (!u) fail("This person no longer exists.");
  if (u!.id === actor.id) fail("You cannot deactivate yourself.");
  if (!canManagePerson(actor, u!)) fail("You are not allowed to manage this person.");
  if (!active && u!.role === "owner" && !db.users.some((x) => x.role === "owner" && x.active_status && x.id !== userId))
    fail("The last owner cannot be deactivated.");
  if (active && u!.role === "owner" && db.users.filter((x) => x.role === "owner" && x.active_status).length >= MAX_OWNERS)
    fail("There can be at most 4 owners.");
  if (active && u!.role === "manager" && db.users.some((x) => x.role === "manager" && x.department_id === u!.department_id && x.active_status))
    fail("This department already has an active manager.");
  return rewire({ ...db, users: db.users.map((x) => (x.id === userId ? { ...x, active_status: active } : x)) });
}

export function addDepartment(db: Database, actor: User, name: string): Database {
  if (actor.role !== "owner" && actor.role !== "ops") fail("Only the Owner or Operations Manager can add departments.");
  const clean = name.trim();
  if (clean.length < 2) fail("Enter a department name.");
  if (db.departments.some((d) => d.name.toLowerCase() === clean.toLowerCase())) fail("This department already exists.");
  const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || uid("d");
  const dept: Department = {
    id: db.departments.some((d) => d.id === id) ? uid("d") : id,
    name: clean,
    short: clean.slice(0, 5).toUpperCase(),
    manager_id: null,
    description: "",
    display_order: db.departments.length,
  };
  return { ...db, departments: [...db.departments, dept] };
}

// --- Events -------------------------------------------------------------------

export interface EventInput {
  title: string;
  kind: EventKind;
  status?: EventStatus;
  starts_at: string;
  ends_at: string;
  area: Area;
  kids: number;
  adults: number;
  contact_name: string;
  contact_phone: string;
  package_price: number;
  deposit: number;
  notes: string;
  owner_id: string | null;
}

export interface PrepTaskInput {
  title: string;
  description: string;
  department_id: string;
  assigned_to: string;
  due_at: string;
  estimated_duration: number;
  priority: Priority;
}

function checkEvent(input: EventInput) {
  if (input.title.trim().length < 2) fail("Give the event a name.");
  if (Number.isNaN(ms(input.starts_at)) || Number.isNaN(ms(input.ends_at))) fail("Set the event date and times.");
  if (ms(input.ends_at) <= ms(input.starts_at)) fail("The event must end after it starts.");
}

function eventFields(input: EventInput) {
  return {
    title: input.title.trim(),
    kind: input.kind,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    area: input.area,
    kids: count(input.kids),
    adults: count(input.adults),
    contact_name: input.contact_name.trim(),
    contact_phone: input.contact_phone.trim(),
    package_price: money(input.package_price),
    deposit: money(input.deposit),
    notes: input.notes.trim(),
    owner_id: input.owner_id || null,
  };
}

/** Event reminders: the day before and an hour before, for the person in charge and the Ops Manager. */
function eventReminders(db: Database, ev: VenueEvent, actorId: string, now: number): Reminder[] {
  const people = new Set<string>();
  if (ev.owner_id) people.add(ev.owner_id);
  const ops = db.users.find((u) => u.role === "ops" && u.active_status);
  if (ops) people.add(ops.id);
  if (people.size === 0) people.add(actorId);
  const start = ms(ev.starts_at);
  const out: Reminder[] = [];
  const add = (suffix: string, at: number, title: string) => {
    if (at <= now) return;
    out.push({
      id: `ev_${ev.id}_${suffix}`,
      title,
      note: [ev.kids + ev.adults > 0 ? `${ev.kids} kids, ${ev.adults} adults` : "", ev.contact_name].filter(Boolean).join(" · "),
      at: iso(at),
      for_user_ids: [...people],
      created_by: actorId,
      event_id: ev.id,
      done_by: [],
      created_at: iso(now),
      deleted_at: null,
    });
  };
  add("1d", start - 24 * 60 * 60_000, `Tomorrow: ${ev.title}`);
  add("1h", start - 60 * 60_000, `In 1 hour: ${ev.title}`);
  return out;
}

export function createEvent(db: Database, actor: User, now: number, input: EventInput, prep: PrepTaskInput[] = []): Database {
  if (!canManageEvents(actor)) fail("Only managers can book events.");
  checkEvent(input);
  const ev: VenueEvent = {
    id: uid("ev"),
    ...eventFields(input),
    status: input.status ?? "booked",
    created_by: actor.id,
    created_at: iso(now),
    updated_at: iso(now),
    deleted_at: null,
  };
  const users = idx(db).userById;
  const tasks: Task[] = prep.map((p) => {
    const to = users.get(p.assigned_to);
    if (!to || (to.id !== actor.id && !canDirect(actor, to))) fail("You cannot assign one of the event tasks to that person.");
    return {
      id: uid("t"),
      title: p.title.trim(),
      description: p.description.trim() || `For the event “${ev.title}”.`,
      department_id: p.department_id,
      assigned_by: actor.id,
      assigned_to: p.assigned_to,
      priority: p.priority,
      status: "pending",
      due_at: p.due_at,
      estimated_duration: p.estimated_duration,
      category: "Event",
      internal_notes: null,
      completion_note: null,
      created_at: iso(now),
      updated_at: iso(now),
      completed_at: null,
      display_order: null,
      deleted_at: null,
      event_id: ev.id,
      recurring_id: null,
    };
  });
  return {
    ...db,
    events: [...db.events, ev],
    tasks: [...db.tasks, ...tasks],
    reminders: [...db.reminders, ...eventReminders(db, ev, actor.id, now)],
    logs: [
      ...db.logs,
      entry(now, null, actor.id, "event_created", null, ev.id),
      ...tasks.map((t) => entry(now, t.id, actor.id, "assigned", null, t.assigned_to)),
    ],
  };
}

export function updateEvent(db: Database, actor: User, now: number, eventId: string, input: EventInput): Database {
  if (!canManageEvents(actor)) fail("Only managers can change events.");
  const ev = db.events.find((e) => e.id === eventId && !e.deleted_at);
  if (!ev) fail("This event no longer exists.");
  checkEvent(input);
  const next: VenueEvent = { ...ev!, ...eventFields(input), status: input.status ?? ev!.status, updated_at: iso(now) };
  // Move the automatic reminders with the event.
  const fresh = new Map(eventReminders(db, next, actor.id, now).map((r) => [r.id, r]));
  const reminders = db.reminders
    .map((r) => {
      if (r.event_id !== ev!.id || !r.id.startsWith(`ev_${ev!.id}_`)) return r;
      const f = fresh.get(r.id);
      fresh.delete(r.id);
      return f ? { ...f, done_by: ms(f.at) === ms(r.at) ? r.done_by : [] } : { ...r, deleted_at: iso(now) };
    })
    .concat([...fresh.values()]);
  return {
    ...db,
    events: db.events.map((e) => (e.id === eventId ? next : e)),
    reminders,
    logs: [...db.logs, entry(now, null, actor.id, "event_updated", null, eventId)],
  };
}

export function setEventStatus(db: Database, actor: User, now: number, eventId: string, status: EventStatus): Database {
  if (!canManageEvents(actor)) fail("Only managers can change events.");
  const ev = db.events.find((e) => e.id === eventId && !e.deleted_at);
  if (!ev) fail("This event no longer exists.");
  if (ev!.status === status) return db;
  const cancelled = status === "cancelled";
  return {
    ...db,
    events: db.events.map((e) => (e.id === eventId ? { ...e, status, updated_at: iso(now) } : e)),
    // A cancelled event takes its reminders and unstarted prep tasks with it.
    reminders: cancelled ? db.reminders.map((r) => (r.event_id === eventId && !r.deleted_at ? { ...r, deleted_at: iso(now) } : r)) : db.reminders,
    tasks: cancelled
      ? db.tasks.map((t) => (t.event_id === eventId && t.status === "pending" && !t.deleted_at ? { ...t, deleted_at: iso(now), updated_at: iso(now) } : t))
      : db.tasks,
    logs: [...db.logs, entry(now, null, actor.id, cancelled ? "event_cancelled" : "event_updated", ev!.status, eventId)],
  };
}

// --- Walk-ins and revenue -----------------------------------------------------

export interface WalkInInput {
  kids: number;
  adults: number;
  area: Area;
  amount: number;
  note?: string;
  at?: string;
}

export function logWalkIn(db: Database, actor: User, now: number, input: WalkInInput): Database {
  if (!canLogWalkIn(actor)) fail("You cannot log walk-ins.");
  const kids = count(input.kids);
  const adults = count(input.adults);
  if (kids + adults === 0) fail("Add at least one person.");
  if (kids + adults > 500) fail("That is more people than the venue holds. Check the numbers.");
  const at = input.at && !Number.isNaN(ms(input.at)) ? input.at : iso(now);
  const w: WalkIn = { id: uid("w"), at, kids, adults, area: input.area, amount: money(input.amount), note: (input.note ?? "").trim(), logged_by: actor.id, deleted_at: null };
  return { ...db, walkins: [...db.walkins, w] };
}

export function removeWalkIn(db: Database, actor: User, now: number, id: string): Database {
  const w = db.walkins.find((x) => x.id === id && !x.deleted_at);
  if (!w) fail("This walk-in no longer exists.");
  if (!canEditWalkIn(actor, w!, now)) fail("Only a manager can remove an older walk-in.");
  return { ...db, walkins: db.walkins.map((x) => (x.id === id ? { ...x, deleted_at: iso(now) } : x)) };
}

export function setRevenue(db: Database, actor: User, now: number, date: string, source: RevenueEntry["source"], amount: number, note = ""): Database {
  if (!canEnterRevenue(actor)) fail("Only managers can enter revenue.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Pick a date.");
  const id = `${date}_${source}`;
  const row: RevenueEntry = { id, date, source, amount: money(amount), note: note.trim(), entered_by: actor.id, updated_at: iso(now) };
  const exists = db.revenue.some((r) => r.id === id);
  return { ...db, revenue: exists ? db.revenue.map((r) => (r.id === id ? row : r)) : [...db.revenue, row] };
}

// --- Reminders ------------------------------------------------------------------

export interface ReminderInput {
  title: string;
  note: string;
  at: string;
  for_user_ids: string[];
  event_id?: string | null;
}

export function createReminder(db: Database, actor: User, now: number, input: ReminderInput): Database {
  if (input.title.trim().length < 2) fail("What should the reminder say?");
  if (Number.isNaN(ms(input.at))) fail("Set the reminder date and time.");
  if (input.for_user_ids.length === 0) fail("Choose who gets the reminder.");
  const allowed = new Set(remindableUsers(db, actor).map((u) => u.id));
  if (input.for_user_ids.some((id) => !allowed.has(id))) fail("You can only send reminders to yourself and your team.");
  const r: Reminder = {
    id: uid("r"),
    title: input.title.trim(),
    note: input.note.trim(),
    at: input.at,
    for_user_ids: [...new Set(input.for_user_ids)],
    created_by: actor.id,
    event_id: input.event_id ?? null,
    done_by: [],
    created_at: iso(now),
    deleted_at: null,
  };
  return { ...db, reminders: [...db.reminders, r] };
}

export function dismissReminder(db: Database, actor: User, id: string): Database {
  return {
    ...db,
    reminders: db.reminders.map((r) => (r.id === id && !r.done_by.includes(actor.id) ? { ...r, done_by: [...r.done_by, actor.id] } : r)),
  };
}

export function deleteReminder(db: Database, actor: User, now: number, id: string): Database {
  const r = db.reminders.find((x) => x.id === id && !x.deleted_at);
  if (!r) fail("This reminder no longer exists.");
  if (r!.created_by !== actor.id && actor.role !== "owner" && actor.role !== "ops") fail("Only the person who set this reminder can delete it.");
  return { ...db, reminders: db.reminders.map((x) => (x.id === id ? { ...x, deleted_at: iso(now) } : x)) };
}

// --- Recurring tasks ----------------------------------------------------------

export interface RecurringInput {
  title: string;
  description: string;
  department_id: string;
  assigned_to: string;
  priority: Priority;
  repeat: Repeat;
  weekdays: number[];
  month_day: number;
  dates?: string[];
  due_time: string;
  estimated_duration: number;
}

const MAX_CUSTOM_DATES = 400;

export function saveRecurring(db: Database, actor: User, now: number, input: RecurringInput, id?: string): Database {
  if (!canManageRecurring(actor)) fail("Only managers can set up recurring tasks.");
  if (input.title.trim().length < 3) fail("Give the task a title.");
  const to = idx(db).userById.get(input.assigned_to);
  if (!to || !canDirect(actor, to)) fail("Choose someone on your team.");
  if (!idx(db).deptById.has(input.department_id) || !canAssign(db, actor, input.assigned_to, input.department_id))
    fail("Choose a department.");
  if (input.repeat === "weekly" && input.weekdays.length === 0) fail("Pick at least one day of the week.");
  const dates = input.repeat === "custom" ? [...new Set((input.dates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort() : [];
  if (input.repeat === "custom" && dates.length === 0) fail("Pick at least one date.");
  if (dates.length > MAX_CUSTOM_DATES) fail("Pick fewer dates.");
  if (!/^\d{2}:\d{2}$/.test(input.due_time)) fail("Set the time it is due.");
  if (!input.estimated_duration || input.estimated_duration <= 0) fail("Set the time allowed.");
  const fields = {
    title: input.title.trim(),
    description: input.description.trim() || input.title.trim(),
    department_id: input.department_id,
    assigned_to: input.assigned_to,
    priority: input.priority,
    repeat: input.repeat,
    weekdays: [...new Set(input.weekdays)].sort(),
    month_day: Math.min(28, Math.max(1, Math.round(input.month_day) || 1)),
    dates,
    due_time: input.due_time,
    estimated_duration: Math.round(input.estimated_duration),
  };
  if (id) {
    if (!db.recurring.some((r) => r.id === id && !r.deleted_at)) fail("This schedule no longer exists.");
    return { ...db, recurring: db.recurring.map((r) => (r.id === id ? { ...r, ...fields } : r)) };
  }
  const rule: RecurringTask = { id: uid("rc"), ...fields, active: true, created_by: actor.id, created_at: iso(now), deleted_at: null };
  return generateRecurring({ ...db, recurring: [...db.recurring, rule] }, now);
}

export function setRecurringActive(db: Database, actor: User, id: string, active: boolean): Database {
  if (!canManageRecurring(actor)) fail("Only managers can change recurring tasks.");
  return { ...db, recurring: db.recurring.map((r) => (r.id === id ? { ...r, active } : r)) };
}

export function deleteRecurring(db: Database, actor: User, now: number, id: string): Database {
  if (!canManageRecurring(actor)) fail("Only managers can change recurring tasks.");
  return { ...db, recurring: db.recurring.map((r) => (r.id === id ? { ...r, deleted_at: iso(now), active: false } : r)) };
}

/** Day of week (0 = Sunday) of a business date. */
export const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

export function recursOn(rule: RecurringTask, key: string): boolean {
  if (rule.repeat === "daily") return true;
  if (rule.repeat === "custom") return !!rule.dates?.includes(key);
  if (rule.repeat === "weekly") return rule.weekdays.includes(weekdayOf(key));
  return Number(key.slice(8, 10)) === rule.month_day;
}

/**
 * Creates today's copy of every active recurring task. The id is fixed per
 * rule and day, so two phones doing this at once write the same record.
 */
export function generateRecurring(db: Database, now: number): Database {
  const today = dateKey(now);
  const existing = new Set(db.tasks.map((t) => t.id));
  const users = idx(db).userById;
  const fresh: Task[] = [];
  const logs = [];
  for (const rule of db.recurring) {
    if (!rule.active || rule.deleted_at) continue;
    // Never back-fill days before the schedule was created.
    if (today < dateKey(rule.created_at) || !recursOn(rule, today)) continue;
    const id = `rt_${rule.id}_${today}`;
    if (existing.has(id)) continue;
    const to = users.get(rule.assigned_to);
    if (!to?.active_status) continue;
    const [h, m] = rule.due_time.split(":").map(Number);
    fresh.push({
      id,
      title: rule.title,
      description: rule.description,
      department_id: rule.department_id,
      assigned_by: rule.created_by,
      assigned_to: rule.assigned_to,
      priority: rule.priority,
      status: "pending",
      due_at: iso(beirutToUtc(today, h, m)),
      estimated_duration: rule.estimated_duration,
      category: "Recurring",
      internal_notes: null,
      completion_note: null,
      created_at: iso(now),
      updated_at: iso(now),
      completed_at: null,
      display_order: null,
      deleted_at: null,
      event_id: null,
      recurring_id: rule.id,
    });
    logs.push({ ...entry(now, id, rule.created_by, "assigned", null, rule.assigned_to), id: `rl_${rule.id}_${today}` });
  }
  return fresh.length === 0 ? db : { ...db, tasks: [...db.tasks, ...fresh], logs: [...db.logs, ...logs] };
}

/** Next dates a schedule fires, for the schedule list. */
export function nextRuns(rule: RecurringTask, fromKey: string, n = 3): string[] {
  if (rule.repeat === "custom") return (rule.dates ?? []).filter((d) => d >= fromKey).slice(0, n);
  const out: string[] = [];
  for (let d = 0; d < 62 && out.length < n; d++) {
    const k = addDays(fromKey, d);
    if (recursOn(rule, k)) out.push(k);
  }
  return out;
}
