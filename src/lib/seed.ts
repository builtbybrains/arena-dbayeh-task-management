// Deterministic demo data. Every person, task and report here is fictional and
// generated from a fixed seed, positioned around the moment the demo is opened
// so the venue always looks mid-shift.

import { scopeDb } from "./scope";
import { departmentSnapshot, executiveSnapshot } from "./selectors";
import { MANAGER_TEMPLATES, TEMPLATES, type TaskTemplate } from "./templates";
import { addDays, beirutToUtc, dateKey, dayEnd, dayStart, iso, MIN } from "./time";
import type {
  ActivityAction,
  Database,
  Department,
  Priority,
  RecurringTask,
  Repeat,
  Restaurant,
  Task,
  TaskActivityLog,
  TaskStatus,
  TaskTimeSession,
  User,
  VenueEvent,
  WalkIn,
} from "./types";

export const DB_VERSION = 3;
const HOUR = 60 * MIN;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Quatro is the restaurant named on arenadbayeh.com.
const RESTAURANTS: Omit<Restaurant, "department_id" | "display_order">[] = [
  { id: "quatro", name: "Quatro Restaurant", description: "Main dining room by the playground: international, Italian and Arabic dishes and a kids' menu." },
];

type Person = [name: string, title: string, restaurant?: string];
/** The Operations department is run by the Operations Manager; the others have their own manager. */
const ORG: { id: string; name: string; short: string; description: string; manager: Person | null; staff: Person[]; parent?: string; venue?: string }[] = [
  { id: "ops", name: "Operations", short: "OPS", description: "Opening, cleaning, maintenance and the daily floor.", manager: null, staff: [["Jad Salem", "Maintenance Technician"], ["Elias Farah", "Cleaning Supervisor"], ["Hadi Rahme", "Maintenance Technician"]] },
  {
    id: "restaurant", name: "Restaurant", short: "F&B", description: "Quatro restaurant: kitchen, waiters and service.", manager: ["Fadi Salem", "Restaurant Manager"],
    staff: [["Mira Daher", "Waiter", "quatro"], ["Samir Khoury", "Waiter", "quatro"], ["Rani Kassab", "Waiter", "quatro"], ["Tala Hanna", "Cook"], ["Karl Habib", "Barista"]],
  },
  { id: "playground", name: "Playground", short: "PLAY", description: "Play areas, entry desk, safety and kids' activities.", manager: ["Lea Nassar", "Playground Manager"], staff: [["Rita Farah", "Playground Attendant"], ["Joe Haddad", "Playground Attendant"], ["Nour Haddad", "Entry Desk Cashier"], ["Chris Saad", "Kids Animator"], ["Adam Elias", "Playground Attendant"]] },
  { id: "christian", name: "Christian", short: "SEC", description: "Security and support, under Operations.", parent: "ops", manager: ["Christian Azar", "Security Supervisor"], staff: [["Fadi Khalil", "Security Guard"], ["Tony Rizk", "Security Guard"]] },
  // Money Mondo: a second venue with its own Operations Manager and team.
  { id: "mondo-ops", name: "Operations", short: "OPS", description: "Money Mondo's daily operations.", venue: "mondo", manager: null, staff: [["Ralph Sfeir", "Floor Supervisor"], ["Maya Aoun", "Cashier"]] },
];

type Slot = "done" | "done_late" | "running" | "running_over" | "paused" | "paused_long" | "pending" | "overdue";
type Plan = [Slot, Priority?][];

// One plan for each department's first two people, in ORG order. The demo
// "Employee" and "Waiter" profiles start with nothing running so the Start
// flow is clean; two people are already running over their time allowed.
const PLANS: Plan[] = [
  [["done"], ["done"], ["pending", "high"], ["pending", "medium"], ["pending", "low"]],
  [["done"], ["running_over"], ["pending"], ["pending"], ["pending"]],
  [["done"], ["done_late"], ["paused"], ["pending"], ["pending"], ["pending"]],
  [["done"], ["running"], ["overdue", "critical"], ["pending"], ["pending"]],
  [["done"], ["done"], ["running"], ["pending"], ["pending"]],
  [["done"], ["done"], ["done"], ["paused_long"], ["pending"]],
  [["done"], ["running"], ["pending"], ["pending"], ["pending"], ["pending"]],
  [["done"], ["done_late"], ["overdue"], ["pending"], ["pending"]],
  [["done"], ["done"], ["running_over"], ["pending"], ["pending"]],
  [["done"], ["done"], ["pending", "high"], ["pending", "medium"], ["pending", "low"]],
  [["done"], ["running"], ["overdue", "critical"], ["overdue"], ["pending"]],
  [["done_late"], ["paused_long"], ["overdue", "high"], ["overdue"], ["pending"]],
  [["done"], ["done"], ["running"], ["pending"], ["pending"]],
  [["done"], ["paused"], ["pending"], ["pending"], ["pending"]],
  [["done"], ["done"], ["running"], ["pending"], ["pending"], ["pending"]],
  [["done"], ["done_late"], ["pending"], ["pending"], ["pending"]],
];

// Plans for anyone beyond the first two people in a department (the waiters).
const EXTRA_PLANS: Plan[] = [
  [["done"], ["running"], ["pending"], ["pending"]],
  [["done"], ["done"], ["paused"], ["pending"], ["pending"]],
  [["done"], ["running"], ["overdue"], ["pending"]],
  [["done"], ["pending"], ["pending"], ["pending"]],
];

const DEMO_STAFF = new Set(["e_ops_1", "e_restaurant_2", "e_playground_1"]);

const MANAGER_SLOTS: Slot[] = ["pending", "done", "running", "pending", "done", "overdue", "pending", "paused"];

const MANAGER_NOTES = [
  "All priority tasks closed before the evening peak.",
  "Two tasks slipped past their deadline; both are closed now.",
  "Smooth day. Team fully staffed.",
  "Handover notes shared with the evening shift.",
  "One follow-up carried to tomorrow morning.",
];
const EXEC_NOTES = [
  "All departments reported. No critical issues open.",
  "Maintenance backlog is the main risk; extra cover arranged.",
  "Strong day across the venue. Weekend preparation on track.",
  "Events and Restaurant handled the evening peak well.",
];

export function buildSeed(nowMs: number): Database {
  const now = Math.floor(nowMs / MIN) * MIN;
  const today = dateKey(now);
  const S = dayStart(today);
  const E = dayEnd(today);
  const rand = rng(20261113);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const shuffled = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let n = a.length - 1; n > 0; n--) {
      const k = Math.floor(rand() * (n + 1));
      [a[n], a[k]] = [a[k], a[n]];
    }
    return a;
  };
  let counter = 0;
  const id = (p: string) => `${p}_${(++counter).toString(36)}`;
  const priority = (): Priority => {
    const r = rand();
    return r < 0.12 ? "critical" : r < 0.4 ? "high" : r < 0.8 ? "medium" : "low";
  };

  // --- People ---------------------------------------------------------------
  const joined = iso(S - 400 * 24 * HOUR);
  const users: User[] = [];
  const addUser = (uid: string, name: string, role: User["role"], title: string, dept: string | null, manager: string | null, restaurant: string | null = null) => {
    const u: User = { id: uid, name, role, title, department_id: dept, manager_id: manager, restaurant_id: restaurant, avatar: String((users.length * 47 + 130) % 360), active_status: true, pin_hash: null, phone: null, created_at: joined };
    users.push(u);
    return u;
  };
  const owner = addUser("u_owner", "Alex Haddad", "owner", "Owner", null, null);
  const gm = addUser("m_ops", "Rami Nassar", "ops", "Operations Manager", null, owner.id);
  const mondoOps = addUser("m_mondo", "Karim Mansour", "ops", "Operations Manager", null, owner.id);
  mondoOps.venue_id = "mondo";
  const departments: Department[] = [];
  const staff: User[] = [];
  const plans: Plan[] = [];
  const managers: User[] = [];
  let extra = 0;
  ORG.forEach((d, n) => {
    const venue = d.venue ?? "arena";
    const ops = venue === "mondo" ? mondoOps : gm;
    const m = d.manager ? addUser(`m_${d.id}`, d.manager[0], "manager", d.manager[1], d.id, ops.id) : ops;
    if (d.manager) managers.push(m);
    departments.push({ id: d.id, name: d.name, short: d.short, manager_id: m.id, description: d.description, display_order: n, venue_id: venue, is_ops: d.manager === null, parent_id: d.parent ?? null });
    d.staff.forEach((p, k) => {
      const u = addUser(`e_${d.id}_${k + 1}`, p[0], "employee", p[1], d.id, m.id, p[2] ?? null);
      u.venue_id = venue;
      staff.push(u);
      plans.push(k < 2 && n * 2 + k < PLANS.length ? PLANS[n * 2 + k] : EXTRA_PLANS[extra++ % EXTRA_PLANS.length]);
    });
    if (d.manager) m.venue_id = venue;
  });
  const managerOf = (dept: string) => managers.find((m) => m.department_id === dept) ?? (dept.startsWith("mondo") ? mondoOps : gm);
  const templatesFor = (dept: string) => TEMPLATES[dept] ?? TEMPLATES.ops;
  const restaurants: Restaurant[] = RESTAURANTS.map((r, n) => ({ ...r, department_id: "restaurant", display_order: n }));

  // --- Tasks ----------------------------------------------------------------
  const tasks: Task[] = [];
  const sessions: TaskTimeSession[] = [];
  const logs: TaskActivityLog[] = [];
  const log = (task_id: string | null, actor_id: string, action: ActivityAction, at: number, prev: string | null = null, next: string | null = null) =>
    logs.push({ id: id("l"), task_id, actor_id, action, previous_value: prev, new_value: next, created_at: iso(at) });
  const session = (task_id: string, employee_id: string, start: number, end: number | null) =>
    sessions.push({ id: id("s"), task_id, employee_id, started_at: iso(start), ended_at: end === null ? null : iso(end), duration_seconds: end === null ? 0 : Math.round((end - start) / 1000) });
  const push = (tid: string, tpl: TaskTemplate, dept: string, by: User, to: User | null, pr: Priority, status: TaskStatus, due: number, created: number, completed: number | null) => {
    tasks.push({
      id: tid, title: tpl.title, description: tpl.description, department_id: dept, assigned_by: by.id, assigned_to: to?.id ?? null,
      priority: pr, status, due_at: iso(due), estimated_duration: tpl.est, category: tpl.category, internal_notes: null, completion_note: null,
      created_at: iso(created), updated_at: iso(completed ?? created), completed_at: completed === null ? null : iso(completed), display_order: null, deleted_at: null,
    });
    log(tid, by.id, "assigned", created, null, to?.id ?? null);
    if (status !== "completed" && due < now) log(tid, to?.id ?? by.id, "overdue", due);
  };

  const lo = S + MIN;
  const hi = E - 10 * MIN;
  const inDay = (v: number) => clamp(v, lo, hi);

  function addToday(dept: string, to: User, by: User, slot: Slot, tpl: TaskTemplate, pr: Priority) {
    const tid = id("t");
    const duration = tpl.est * MIN * between(0.6, 1.3);
    let due = now;
    let status: TaskStatus = "pending";
    let completed: number | null = null;
    let first = now;
    switch (slot) {
      case "done":
      case "done_late": {
        completed = clamp(now - between(20, 360) * MIN, lo, now - MIN);
        first = completed - duration;
        session(tid, to.id, first, completed);
        due = slot === "done" ? inDay(completed + between(10, 120) * MIN) : Math.max(lo, completed - between(10, 50) * MIN);
        status = "completed";
        break;
      }
      case "running": {
        const start = now - between(4, 35) * MIN;
        first = start;
        if (rand() < 0.35) {
          const pausedAt = start - between(5, 20) * MIN;
          first = pausedAt - between(4, 12) * MIN;
          session(tid, to.id, first, pausedAt);
        }
        session(tid, to.id, start, null);
        due = inDay(now + between(15, 120) * MIN);
        status = "in_progress";
        break;
      }
      case "running_over": {
        // Already past the time allowed, so the alerts have something to show.
        first = now - tpl.est * MIN * between(1.25, 1.7);
        session(tid, to.id, first, null);
        due = inDay(now + between(10, 60) * MIN);
        status = "in_progress";
        break;
      }
      case "paused":
      case "paused_long": {
        const end = now - (slot === "paused" ? between(8, 30) : between(70, 140)) * MIN;
        first = end - between(5, 25) * MIN;
        session(tid, to.id, first, end);
        due = inDay(now + (slot === "paused" ? between(20, 150) : between(-30, 60)) * MIN);
        status = "paused";
        break;
      }
      case "pending":
        due = inDay(now + between(40, 360) * MIN);
        break;
      case "overdue":
        due = clamp(now - between(25, 170) * MIN, lo, now - 5 * MIN);
        break;
    }
    const created = Math.min(S + between(6, 8.5) * HOUR, first - 10 * MIN, now - 5 * MIN);
    push(tid, tpl, dept, by, to, pr, status, due, created, completed);
    const mine = sessions.filter((s) => s.task_id === tid);
    mine.forEach((s, n) => {
      log(tid, to.id, n === 0 ? "started" : "resumed", Date.parse(s.started_at));
      if (s.ended_at && !(status === "completed" && n === mine.length - 1)) log(tid, to.id, "paused", Date.parse(s.ended_at));
    });
    if (completed !== null) log(tid, to.id, "completed", completed);
  }

  staff.forEach((person, n) => {
    const dept = person.department_id!;
    const manager = managerOf(dept);
    const pool = shuffled(templatesFor(dept));
    plans[n].forEach(([slot, forced], k) => addToday(dept, person, k % 4 === 3 ? gm : manager, slot, pool[k % pool.length], forced ?? priority()));
  });
  managers.forEach((m, n) => addToday(m.department_id!, m, gm, MANAGER_SLOTS[n], MANAGER_TEMPLATES[n % MANAGER_TEMPLATES.length], n === 1 ? "high" : priority()));
  addToday("ops", gm, owner, "pending", { title: "Prepare weekly operations briefing for ownership", description: "Summarise the week's performance, open risks and next week's priorities.", est: 45, category: "Management" }, "high");
  addToday("ops", gm, owner, "running", { title: "Check the weekend staffing plan", description: "Make sure the restaurant and playground have enough people for Saturday's parties.", est: 30, category: "Management" }, "critical");

  // Two urgent tasks nobody has picked up yet.
  [
    { dept: "ops", tpl: TEMPLATES.ops[10], pr: "critical" as Priority, mins: 50 },
    { dept: "playground", tpl: TEMPLATES.playground[6], pr: "high" as Priority, mins: 95 },
  ].forEach((u) => push(id("t"), u.tpl, u.dept, gm, null, u.pr, "pending", inDay(now + u.mins * MIN), now - between(15, 40) * MIN, null));

  // --- 14 days of history ---------------------------------------------------
  let lingering = 0;
  for (let d = 14; d >= 1; d--) {
    const day = addDays(today, -d);
    const dS = dayStart(day);
    const dE = dayEnd(day);
    const roughDay = d % 5 === 0 ? 0.14 : 0;
    for (const person of staff) {
      const dept = person.department_id!;
      const manager = managerOf(dept);
      const pool = shuffled(templatesFor(dept));
      const count = 2 + (rand() < 0.55 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const tpl = pool[k];
        const tid = id("t");
        const due = dS + between(9, 22) * HOUR;
        const created = dS + between(6, 8.5) * HOUR;
        // The demo Employee and Waiter profiles never carry old unfinished work.
        const roll = rand();
        const stays = d <= 3 && lingering < 6 && !DEMO_STAFF.has(person.id) && roll < (dept === "ops" ? 0.2 : 0.05);
        if (stays) {
          const pr: Priority = lingering === 0 ? "critical" : lingering === 1 ? "high" : priority();
          lingering++;
          push(tid, tpl, dept, manager, person, pr, "pending", due, created, null);
          continue;
        }
        const late = rand() < (dept === "ops" ? 0.3 : dept === "playground" ? 0.2 : 0.12) + roughDay;
        const completed = clamp(late ? due + between(10, 120) * MIN : due - between(5, 90) * MIN, created + 20 * MIN, Math.min(dE - MIN, now - MIN));
        const start = Math.max(created + 5 * MIN, completed - tpl.est * MIN * between(0.6, 1.4));
        session(tid, person.id, start, completed);
        push(tid, tpl, dept, manager, person, priority(), "completed", due, created, completed);
        log(tid, person.id, "completed", completed);
      }
    }
  }

  const db: Database = {
    version: DB_VERSION,
    seeded_at: iso(now),
    workspace: { id: "workspace", name: "Arena Dbayeh", created_at: joined, created_by: owner.id, walkin_price_kid: 10, walkin_price_adult: 0 },
    venues: [
      { id: "arena", name: "Arena", display_order: 0 },
      { id: "mondo", name: "Money Mondo", display_order: 1, walkin_price_kid: 8, walkin_price_adult: 0 },
    ],
    users,
    departments,
    restaurants,
    tasks,
    sessions,
    logs,
    daily_reports: [],
    executive_reports: [],
    events: [],
    walkins: [],
    revenue: [],
    reminders: [],
    recurring: [],
  };
  seedVenue(db, now, rand, id, { owner, ops: gm, managers: managers.filter((m) => m.venue_id === "arena"), staff: staff.filter((u) => u.venue_id === "arena") });
  seedMondo(db, now, rand, id, mondoOps, staff.filter((u) => u.venue_id === "mondo"));

  // --- Submitted reports for every past day ---------------------------------
  for (let d = 14; d >= 1; d--) {
    const day = addDays(today, -d);
    const end = dayEnd(day);
    const ids: string[] = [];
    for (const dep of departments) {
      if (!dep.manager_id) continue;
      const at = Math.min(dayStart(day) + between(21.5, 23.4) * HOUR, now - MIN);
      const rid = id("dr");
      ids.push(rid);
      db.daily_reports.push({ id: rid, report_date: day, department_id: dep.id, submitted_by: dep.manager_id, submitted_at: iso(at), status: "reviewed", generated_snapshot: departmentSnapshot(db, dep.id, day, day, end), manager_notes: pick(MANAGER_NOTES) });
      log(null, dep.manager_id, "report_submitted", at, null, dep.id);
    }
    const at = Math.min(dayStart(day) + 23.7 * HOUR, now - MIN / 2);
    const arenaDepts = new Set(departments.filter((x) => x.venue_id === "arena").map((x) => x.id));
    db.executive_reports.push({
      id: id("er"),
      report_date: day,
      submitted_by: gm.id,
      submitted_at: iso(at),
      department_report_ids: ids.filter((rid) => arenaDepts.has(db.daily_reports.find((r) => r.id === rid)?.department_id ?? "")),
      generated_snapshot: executiveSnapshot(scopeDb(db, "arena"), day, end),
      executive_notes: pick(EXEC_NOTES),
      venue_id: "arena",
    });
    log(null, gm.id, "report_submitted", at, null, "executive");
  }

  logs.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return db;
}

/** The profiles offered on the sample-data login screen. */
export const DEMO_PROFILES: { userId: string; label: string }[] = [
  { userId: "u_owner", label: "Owner" },
  { userId: "m_ops", label: "Operations Manager" },
  { userId: "m_christian", label: "Christian section manager" },
  { userId: "m_mondo", label: "Money Mondo Operations Manager" },
  { userId: "m_restaurant", label: "Restaurant Manager" },
  { userId: "m_playground", label: "Playground Manager" },
  { userId: "e_playground_1", label: "Playground staff" },
  { userId: "e_restaurant_2", label: "Waiter" },
];

// --- Events, walk-ins, revenue, reminders and recurring tasks -------------------

const EVENT_SAMPLES: { title: string; kind: VenueEvent["kind"]; area: VenueEvent["area"]; kids: [number, number]; adults: [number, number]; price: [number, number]; hours: [number, number] }[] = [
  { title: "Birthday party", kind: "birthday", area: "playground", kids: [12, 30], adults: [8, 20], price: [350, 900], hours: [2, 3] },
  { title: "School trip", kind: "school", area: "playground", kids: [30, 70], adults: [3, 8], price: [400, 1200], hours: [3, 4] },
  { title: "Corporate family day", kind: "corporate", area: "whole_venue", kids: [20, 50], adults: [30, 80], price: [1500, 4000], hours: [4, 6] },
  { title: "Private dinner", kind: "private", area: "restaurant", kids: [0, 6], adults: [15, 40], price: [600, 1800], hours: [3, 4] },
  { title: "Kids football tournament", kind: "tournament", area: "sports", kids: [24, 48], adults: [15, 40], price: [500, 1200], hours: [3, 5] },
];
const KID_NAMES = ["Karim", "Lynn", "Jad", "Maya", "Ralph", "Yara", "Charbel", "Lea", "Elio", "Sara", "Joy", "Marc"];
const CONTACTS = ["Rima Haddad", "Georges Khoury", "Nadine Saab", "Fouad Rahme", "Lara Abboud", "Tony Azar", "Mona Bitar", "Sami Nassar"];

function seedVenue(
  db: Database,
  now: number,
  rand: () => number,
  id: (p: string) => string,
  who: { owner: User; ops: User; managers: User[]; staff: User[] },
) {
  const today = dateKey(now);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const int = (a: number, b: number) => Math.round(between(a, b));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const play = who.managers.find((m) => m.department_id === "playground")!;
  const rest = who.managers.find((m) => m.department_id === "restaurant")!;
  const weekday = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay();
  const weekend = (k: string) => weekday(k) === 0 || weekday(k) === 6;

  // Events: a few a week, more on weekends, from two weeks back to three weeks ahead.
  for (let d = -14; d <= 21; d++) {
    const k = addDays(today, d);
    const n = weekend(k) ? int(2, 4) : rand() < 0.45 ? 1 : 0;
    for (let e = 0; e < n; e++) {
      const tpl = weekend(k) ? pick([EVENT_SAMPLES[0], EVENT_SAMPLES[0], EVENT_SAMPLES[2], EVENT_SAMPLES[4], EVENT_SAMPLES[3]]) : pick([EVENT_SAMPLES[1], EVENT_SAMPLES[0], EVENT_SAMPLES[3]]);
      const startH = tpl.kind === "school" ? int(9, 10) : tpl.kind === "private" ? int(19, 20) : int(11, 17);
      const start = beirutToUtc(k, startH, pick([0, 30]));
      const end = start + Math.round(between(tpl.hours[0], tpl.hours[1])) * HOUR;
      const title = tpl.kind === "birthday" ? `${pick(KID_NAMES)}'s birthday party` : tpl.title;
      const past = end < now;
      const status: VenueEvent["status"] = past ? (rand() < 0.06 ? "cancelled" : "done") : rand() < 0.7 ? "confirmed" : "booked";
      const price = Math.round(between(tpl.price[0], tpl.price[1]) / 10) * 10;
      const owner = tpl.area === "restaurant" ? rest : tpl.area === "whole_venue" ? who.ops : play;
      const ev: VenueEvent = {
        id: id("ev"),
        title,
        kind: tpl.kind,
        status,
        starts_at: iso(start),
        ends_at: iso(end),
        area: tpl.area,
        kids: int(tpl.kids[0], tpl.kids[1]),
        adults: int(tpl.adults[0], tpl.adults[1]),
        contact_name: pick(CONTACTS),
        contact_phone: `+961 ${int(3, 81)} ${int(100, 999)} ${int(100, 999)}`,
        package_price: price,
        deposit: status === "booked" ? 0 : Math.round(price * 0.3),
        notes: tpl.kind === "birthday" ? "Theme: superheroes. Cake from the client." : "",
        owner_id: owner.id,
        created_by: who.ops.id,
        created_at: iso(Math.min(now - HOUR, start - between(3, 20) * 24 * HOUR)),
        updated_at: iso(Math.min(now - HOUR, start - 24 * HOUR)),
        deleted_at: null,
      };
      db.events.push(ev);
      // Prep and cleanup tasks for today's and tomorrow's events.
      if (d === 0 || d === 1) {
        const dept = owner.department_id ?? "ops";
        const team = who.staff.filter((u) => u.department_id === (dept === "ops" ? "playground" : dept));
        const prep = [
          { title: `Prepare the area for ${ev.title}`, at: start - 60 * MIN, est: 40 },
          { title: `Clean up after ${ev.title}`, at: end + 30 * MIN, est: 30 },
        ];
        for (const p of prep) {
          const to = pick(team);
          const done = p.at < now - 20 * MIN;
          const tid = id("t");
          db.tasks.push({
            id: tid, title: p.title, description: `For the event “${ev.title}” (${ev.kids} kids, ${ev.adults} adults).`, department_id: to.department_id!, assigned_by: owner.id, assigned_to: to.id,
            priority: "high", status: done ? "completed" : "pending", due_at: iso(p.at), estimated_duration: p.est, category: "Event", internal_notes: null, completion_note: null,
            created_at: ev.created_at, updated_at: ev.updated_at, completed_at: done ? iso(p.at - 5 * MIN) : null, display_order: null, deleted_at: null, event_id: ev.id, recurring_id: null,
          });
          db.logs.push({ id: id("l"), task_id: tid, actor_id: owner.id, action: "assigned", previous_value: null, new_value: to.id, created_at: ev.created_at });
          if (done) {
            db.sessions.push({ id: id("s"), task_id: tid, employee_id: to.id, started_at: iso(p.at - (p.est + 5) * MIN), ended_at: iso(p.at - 5 * MIN), duration_seconds: p.est * 60 });
          }
        }
      }
      if (!past && status !== "cancelled" && start - 24 * HOUR > now) {
        db.reminders.push({ id: `ev_${ev.id}_1d`, title: `Tomorrow: ${ev.title}`, note: `${ev.kids} kids, ${ev.adults} adults · ${ev.contact_name}`, at: iso(start - 24 * HOUR), for_user_ids: [owner.id, who.ops.id], created_by: who.ops.id, event_id: ev.id, done_by: [], created_at: ev.created_at, deleted_at: null });
      }
    }
  }

  // Walk-ins: groups arriving through the day, busier at weekends and afternoons.
  const desk = who.staff.filter((u) => u.department_id === "playground");
  for (let d = 28; d >= 0; d--) {
    const k = addDays(today, -d);
    const groups = Math.round(weekend(k) ? between(28, 45) : between(12, 24));
    for (let g = 0; g < groups; g++) {
      const hour = rand() < 0.55 ? between(14, 19.5) : between(10, 14);
      const at = beirutToUtc(k, Math.floor(hour), Math.floor((hour % 1) * 60));
      if (at > now - 2 * MIN) continue;
      const kids = int(1, 4);
      const adults = int(1, 2);
      const area: WalkIn["area"] = rand() < 0.82 ? "playground" : rand() < 0.5 ? "restaurant" : "sports";
      db.walkins.push({ id: id("w"), at: iso(at), kids, adults, area, amount: area === "playground" ? kids * 10 : 0, note: "", logged_by: pick(desk).id, deleted_at: null });
    }
  }

  // Restaurant sales typed in each evening.
  for (let d = 28; d >= 1; d--) {
    const k = addDays(today, -d);
    const amount = Math.round((weekend(k) ? between(1800, 3200) : between(700, 1500)) / 10) * 10;
    db.revenue.push({ id: `${k}_restaurant`, date: k, source: "restaurant", amount, note: "", entered_by: rest.id, updated_at: iso(dayStart(k) + 23 * HOUR) });
  }

  // Recurring tasks.
  const rule = (title: string, description: string, dept: string, to: User, by: User, repeat: Repeat, due: string, est: number, weekdays: number[] = [], month_day = 1): RecurringTask => ({
    id: id("rc"), title, description, department_id: dept, assigned_to: to.id, priority: "high", repeat, weekdays, month_day, due_time: due, estimated_duration: est, active: true, created_by: by.id, created_at: iso(dayStart(addDays(today, -30))), deleted_at: null,
  });
  db.recurring.push(
    rule("Daily playground opening check", "Inspect every play zone, nets and padding before doors open.", "playground", who.staff.find((u) => u.department_id === "playground")!, play, "daily", "09:30", 30),
    rule("Weekly deep clean of soft play", "Full sanitise of the soft-play zone, ball pit and mats.", "playground", who.staff.filter((u) => u.department_id === "playground")[1], play, "weekly", "22:00", 90, [1]),
    rule("Kitchen hygiene checklist", "Fridges, prep surfaces, hand-wash points and temperatures.", "restaurant", who.staff.find((u) => u.title === "Cook")!, rest, "daily", "11:00", 25),
    rule("Monthly generator service", "Run, check oil and log fuel for the backup generator.", "ops", who.staff.find((u) => u.department_id === "ops")!, who.ops, "monthly", "10:00", 45, [], 1),
  );

  // A couple of personal reminders.
  db.reminders.push(
    { id: id("r"), title: "Call the inflatable supplier about the repair", note: "Ask for the quote by Friday.", at: iso(now - 25 * MIN), for_user_ids: [who.ops.id], created_by: who.owner.id, event_id: null, done_by: [], created_at: iso(now - 3 * HOUR), deleted_at: null },
    { id: id("r"), title: "Count the entry desk cash", note: "", at: iso(beirutToUtc(today, 22, 0)), for_user_ids: [play.id], created_by: play.id, event_id: null, done_by: [], created_at: iso(now - 5 * HOUR), deleted_at: null },
  );
}

/** Money Mondo's walk-ins and takings, so its reports have something to show. */
function seedMondo(db: Database, now: number, rand: () => number, id: (p: string) => string, ops: User, team: User[]) {
  const today = dateKey(now);
  const between = (a: number, b: number) => a + rand() * (b - a);
  for (let d = 28; d >= 0; d--) {
    const k = addDays(today, -d);
    const weekend = [0, 6].includes(new Date(`${k}T12:00:00Z`).getUTCDay());
    const groups = Math.round(weekend ? between(14, 24) : between(5, 12));
    for (let g = 0; g < groups; g++) {
      const hour = between(11, 21);
      const at = beirutToUtc(k, Math.floor(hour), Math.floor((hour % 1) * 60));
      if (at > now - 2 * MIN) continue;
      const kids = Math.round(between(1, 3));
      db.walkins.push({ id: id("w"), at: iso(at), kids, adults: Math.round(between(1, 2)), area: "playground", amount: kids * 8, note: "", logged_by: team[Math.floor(rand() * team.length)]?.id ?? ops.id, deleted_at: null, venue_id: "mondo" });
    }
    if (d >= 1) {
      db.revenue.push({ id: `mondo_${k}_other`, date: k, source: "other", amount: Math.round(between(150, 600) / 10) * 10, note: "Shop and snacks", entered_by: ops.id, updated_at: iso(dayStart(k) + 22 * HOUR), venue_id: "mondo" });
    }
  }
}
