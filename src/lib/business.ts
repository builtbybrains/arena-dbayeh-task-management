// Two businesses in one workspace: Arena (the venue) and Money Mondo.
//
// Every screen works on a *view* of the database for one business:
//
// - The Arena view holds Arena's people, departments, tasks, events, walk-ins…
//   and nothing from Money Mondo, so the Operations Manager and Arena staff can
//   never see it.
// - The Money Mondo view maps its people onto the same chain of command the
//   screens already understand: the owners stay owners, the Mall Manager runs
//   the whole business (like the Operations Manager does at Arena), the OMT
//   Manager runs the OMT team (like a department manager), and every job is a
//   team. A person with two jobs belongs to two teams.
//
// Writes run against the view and `mergeBack` copies what changed into the
// full database, which is what syncs.

import type { Business, Collection, Database, Department, MmJob, Role, User } from "./types";
import { COLLECTIONS } from "./types";

export const MAX_OWNERS = 4;

export const MM_JOBS: MmJob[] = ["mall_manager", "omt_manager", "omt", "sales", "collector", "group", "bb"];
/** Jobs that do the work (everything except the two managers). */
export const MM_STAFF_JOBS: MmJob[] = ["omt", "sales", "collector", "group", "bb"];
export const MM_JOB_LABEL: Record<MmJob, string> = {
  mall_manager: "Mall Manager",
  omt_manager: "OMT Manager",
  omt: "OMT Operator",
  sales: "Sales",
  collector: "Money Collector",
  group: "Group Agent",
  bb: "BB",
};
/** The team each staff job belongs to. */
export const MM_JOB_TEAM: Partial<Record<MmJob, string>> = {
  omt: "mm_omt",
  sales: "mm_sales",
  collector: "mm_collect",
  group: "mm_group",
  bb: "mm_bb",
};

/** Money Mondo's teams, one per job. They are fixed, so they are not stored. */
export const MM_TEAMS: Omit<Department, "manager_id">[] = [
  { id: "mm_omt", name: "OMT", short: "OMT", description: "OMT operators: transfers, payments and the OMT counter.", display_order: 0 },
  { id: "mm_sales", name: "Sales", short: "SALES", description: "Sales staff at the mall.", display_order: 1 },
  { id: "mm_collect", name: "Money Collection", short: "COLLECT", description: "Money collectors: cash pickups and hand-overs.", display_order: 2 },
  { id: "mm_group", name: "Group Agents", short: "GROUP", description: "Group agents.", display_order: 3 },
  { id: "mm_bb", name: "BB", short: "BB", description: "BB.", display_order: 4 },
];

export const BUSINESS_NAME: Record<Business, string> = { arena: "Arena", mm: "Money Mondo" };

export const isMmTeam = (deptId: string | null | undefined) => !!deptId && deptId.startsWith("mm_");

/** Part of Arena right now. The owners are in both businesses. */
export const inArena = (u: User) => u.role === "owner" || u.in_arena !== false;
/** Part of Money Mondo right now. */
export const inMm = (u: User) => u.role === "owner" || (u.mm_jobs?.length ?? 0) > 0;

/** The businesses a person can open, Arena first. */
export function businessesOf(u: User): Business[] {
  if (!u.active_status) return [];
  const out: Business[] = [];
  if (inArena(u)) out.push("arena");
  if (inMm(u)) out.push("mm");
  return out;
}

export const jobsOf = (u: User): MmJob[] => MM_JOBS.filter((j) => u.mm_jobs?.includes(j));
export const jobTitle = (jobs: MmJob[]) => MM_JOBS.filter((j) => jobs.includes(j)).map((j) => MM_JOB_LABEL[j]).join(" · ");

// --- Views ---------------------------------------------------------------------

const cache = new WeakMap<Database, Partial<Record<Business, Database>>>();

/** The database as one business sees it. Cached per database version. */
export function project(db: Database, biz: Business): Database {
  let c = cache.get(db);
  if (!c) cache.set(db, (c = {}));
  return (c[biz] ??= biz === "arena" ? arenaView(db) : mmView(db));
}

function split(db: Database, mm: boolean) {
  const tasks = db.tasks.filter((t) => isMmTeam(t.department_id) === mm);
  const ids = new Set(tasks.map((t) => t.id));
  const mine = (b: Business | undefined) => (b === "mm") === mm;
  return {
    tasks,
    sessions: db.sessions.filter((s) => ids.has(s.task_id)),
    logs: db.logs.filter((l) => (l.task_id ? ids.has(l.task_id) : mine(l.business))),
    daily_reports: db.daily_reports.filter((r) => isMmTeam(r.department_id) === mm),
    executive_reports: db.executive_reports.filter((r) => mine(r.business)),
    reminders: db.reminders.filter((r) => mine(r.business)),
    recurring: db.recurring.filter((r) => isMmTeam(r.department_id) === mm),
  };
}

function arenaView(db: Database): Database {
  return {
    ...db,
    ...split(db, false),
    // Someone who left Arena but still works at Money Mondo shows as inactive.
    users: db.users.filter((u) => inArena(u) || u.left_arena).map((u) => (inArena(u) ? u : { ...u, active_status: false })),
    departments: db.departments.filter((d) => !isMmTeam(d.id)),
    mm_pickups: [],
    mm_cash: [],
    mm_transfers: [],
    mm_expenses: [],
  };
}

function mmView(db: Database): Database {
  const users = mmUsers(db.users);
  const active = (job: MmJob) => db.users.find((u) => u.active_status && u.mm_jobs?.includes(job));
  const mall = active("mall_manager");
  const omtMgr = active("omt_manager");
  const departments: Department[] = MM_TEAMS.map((d) => ({
    ...d,
    manager_id: d.id === "mm_omt" ? (omtMgr?.id ?? mall?.id ?? null) : (mall?.id ?? null),
  }));
  return {
    ...db,
    ...split(db, true),
    users,
    departments,
    restaurants: [],
    events: [],
    walkins: [],
    revenue: [],
  };
}

/** Money Mondo's people, mapped onto the chain of command. */
function mmUsers(all: User[]): User[] {
  const owners = all.filter((u) => u.role === "owner");
  const firstOwner = owners.find((u) => u.active_status) ?? owners[0];
  const live = (job: MmJob) => all.find((u) => u.active_status && u.mm_jobs?.includes(job));
  const mall = live("mall_manager");
  const omtMgr = live("omt_manager");
  const out: User[] = [];
  for (const u of all) {
    if (u.role === "owner") {
      out.push({ ...u, business: "mm", department_id: null, department_ids: [], restaurant_id: null, manager_id: null });
      continue;
    }
    if (u.mm_jobs === undefined) continue;
    const jobs = jobsOf(u);
    const teams = MM_STAFF_JOBS.filter((j) => jobs.includes(j)).map((j) => MM_JOB_TEAM[j]!);
    const role: Role = jobs.includes("mall_manager") ? "ops" : jobs.includes("omt_manager") ? "manager" : "employee";
    const department_id = role === "ops" ? null : role === "manager" ? "mm_omt" : (teams[0] ?? null);
    const department_ids = role === "manager" ? [...new Set(["mm_omt", ...teams])] : teams;
    const above =
      role === "ops"
        ? firstOwner?.id
        : role === "manager"
          ? (mall?.id ?? firstOwner?.id)
          : department_id === "mm_omt" && omtMgr && omtMgr.id !== u.id
            ? omtMgr.id
            : (mall?.id ?? firstOwner?.id);
    out.push({
      ...u,
      business: "mm",
      role,
      title: jobs.length ? jobTitle(jobs) : "Money Mondo",
      department_id,
      department_ids,
      restaurant_id: null,
      manager_id: above && above !== u.id ? above : null,
      active_status: u.active_status && jobs.length > 0,
      runs: role === "ops" ? MM_TEAMS.map((d) => d.id).filter((id) => id !== "mm_omt" || !omtMgr) : undefined,
    });
  }
  return out;
}

// --- Writing back ----------------------------------------------------------------

/** Collections whose new records carry the business they were made in. */
const STAMPED = new Set<Collection>(["logs", "executive_reports", "reminders"]);

type Row = { id: string };

function upsert<T extends Row>(list: T[], changed: T[]): T[] {
  const byId = new Map(changed.map((x) => [x.id, x]));
  const out = list.map((x) => {
    const v = byId.get(x.id);
    if (!v) return x;
    byId.delete(x.id);
    return v;
  });
  for (const v of byId.values()) out.push(v);
  return out;
}

/**
 * Copies what a write changed in a view (`before` → `after`) into the full
 * database. Money Mondo's people and teams are never written through a view:
 * they have their own functions in mm-engine.ts.
 */
export function mergeBack(full: Database, before: Database, after: Database, biz: Business): Database {
  if (after === before) return full;
  const out: Database = { ...full };
  for (const c of COLLECTIONS) {
    if (c === "users") continue;
    if (biz === "mm" && (c === "departments" || c === "restaurants")) continue;
    const a = before[c] as unknown as Row[];
    const b = after[c] as unknown as Row[];
    if (a === b) continue;
    const prev = new Map(a.map((x) => [x.id, x]));
    let changed = b.filter((x) => prev.get(x.id) !== x);
    if (changed.length === 0) continue;
    if (biz === "mm" && STAMPED.has(c)) {
      changed = changed.map((x) => ((x as { business?: Business }).business === "mm" ? x : { ...x, business: "mm" }));
    }
    (out as unknown as Record<string, Row[]>)[c] = upsert(full[c] as unknown as Row[], changed);
  }
  if (biz === "arena") {
    if (after.workspace !== before.workspace) out.workspace = after.workspace;
    if (after.users !== before.users) out.users = mergeArenaUsers(full.users, before.users, after.users);
  }
  return out;
}

/** Field-by-field, so Money Mondo details on a person are never lost. */
function mergeArenaUsers(full: User[], before: User[], after: User[]): User[] {
  const prev = new Map(before.map((u) => [u.id, u]));
  const changed: User[] = [];
  for (const u of after) {
    const p = prev.get(u.id);
    if (p === u) continue;
    const base = full.find((x) => x.id === u.id);
    if (!base || !p) {
      changed.push(u);
      continue;
    }
    const merged: Record<string, unknown> = { ...base };
    for (const k of Object.keys(u) as (keyof User)[]) if (u[k] !== p[k]) merged[k] = u[k];
    const m = merged as unknown as User;
    if (p.active_status !== u.active_status && base.role !== "owner") {
      if (!u.active_status && (base.mm_jobs?.length ?? 0) > 0 && base.active_status) {
        // Leaving Arena but still at Money Mondo: keep their sign-in.
        m.active_status = true;
        m.in_arena = false;
        m.left_arena = true;
      } else if (u.active_status && base.in_arena === false) {
        m.in_arena = true;
        m.left_arena = false;
      }
    }
    changed.push(m);
  }
  return upsert(full, changed);
}
