// Venues: Arena and Money Mondo share one workspace but are run separately.
// Everyone except the Owners belongs to one venue and only ever sees that
// venue's people, tasks, events, walk-ins and revenue. Owners switch between
// venues. Every screen reads a "scoped" copy of the database built here, so
// the filtering lives in one place.

import { COLLECTIONS, type Database, type Department, type User, type Venue } from "./types";

export const ARENA = "arena";
export const MONDO = "mondo";

/** Records written before venues existed belong to Arena. */
export const venueOf = (x: { venue_id?: string | null }) => x.venue_id || ARENA;

/** A person's venue; null for Owners, who see every venue. */
export const userVenue = (u: User): string | null => (u.role === "owner" ? null : venueOf(u));

export const isOpsDept = (d: Department) => d.id === "ops" || !!d.is_ops;

const DEFAULT_VENUES: Venue[] = [
  { id: ARENA, name: "Arena", display_order: 0 },
  { id: MONDO, name: "Money Mondo", display_order: 1 },
];

/** Every venue, including Arena even if it was never written down. */
export function venuesOf(db: Database): Venue[] {
  const list = [...(db.venues ?? [])];
  for (const v of DEFAULT_VENUES) if (!list.some((x) => x.id === v.id)) list.push(v);
  return list.sort((a, b) => a.display_order - b.display_order);
}

export const venueName = (db: Database, id: string) => venuesOf(db).find((v) => v.id === id)?.name ?? id;

/** The Operations department of a venue. */
export const opsDeptOf = (db: Database, venueId: string) =>
  db.departments.find((d) => isOpsDept(d) && venueOf(d) === venueId);

/** Entry prices for a venue: Arena keeps the workspace prices. */
export function venuePrices(db: Database, venueId: string) {
  const v = venuesOf(db).find((x) => x.id === venueId);
  return {
    kid: v?.walkin_price_kid ?? (venueId === ARENA ? (db.workspace?.walkin_price_kid ?? 0) : 0),
    adult: v?.walkin_price_adult ?? (venueId === ARENA ? (db.workspace?.walkin_price_adult ?? 0) : 0),
  };
}

const cache = new WeakMap<Database, Map<string, Database>>();

/** The database as seen from one venue. Owners stay listed so names resolve. */
export function scopeDb(db: Database, venueId: string): Database {
  let byVenue = cache.get(db);
  if (!byVenue) cache.set(db, (byVenue = new Map()));
  const hit = byVenue.get(venueId);
  if (hit) return hit;
  const departments = db.departments.filter((d) => venueOf(d) === venueId);
  const depts = new Set(departments.map((d) => d.id));
  const tasks = db.tasks.filter((t) => depts.has(t.department_id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const out: Database = {
    ...db,
    scope_venue: venueId,
    departments,
    users: db.users.filter((u) => u.role === "owner" || venueOf(u) === venueId),
    restaurants: db.restaurants.filter((r) => depts.has(r.department_id)),
    tasks,
    sessions: db.sessions.filter((s) => taskIds.has(s.task_id)),
    logs: db.logs.filter((l) =>
      l.task_id ? taskIds.has(l.task_id) : l.action !== "report_submitted" || depts.has(l.new_value ?? "") || l.new_value === `executive:${venueId}` || (venueId === ARENA && l.new_value === "executive"),
    ),
    daily_reports: db.daily_reports.filter((r) => depts.has(r.department_id)),
    executive_reports: db.executive_reports.filter((r) => venueOf(r) === venueId),
    events: db.events.filter((e) => venueOf(e) === venueId),
    walkins: db.walkins.filter((w) => venueOf(w) === venueId),
    revenue: db.revenue.filter((r) => venueOf(r) === venueId),
    recurring: db.recurring.filter((r) => depts.has(r.department_id)),
  };
  byVenue.set(venueId, out);
  return out;
}

/** The venue a write happens in: the slice's venue, or Arena. */
export const venueHere = (db: Database) => db.scope_venue ?? ARENA;

type Row = { id: string };

/**
 * Applies what an action changed in a venue slice (`before` → `after`) to the
 * full database. Records are matched by id; nothing is ever hard-deleted.
 */
export function mergeInto(full: Database, before: Database, after: Database): Database {
  const next: Database = { ...full };
  if (after.workspace !== before.workspace) next.workspace = after.workspace;
  for (const c of COLLECTIONS) {
    const a = (before[c] ?? []) as Row[];
    const b = (after[c] ?? []) as Row[];
    if (a === b) continue;
    const old = new Map(a.map((x) => [x.id, x]));
    const changed = new Map<string, Row>();
    for (const x of b) if (old.get(x.id) !== x) changed.set(x.id, x);
    if (changed.size === 0) continue;
    const list = ((full[c] ?? []) as Row[]).map((x) => {
      const v = changed.get(x.id);
      if (!v) return x;
      changed.delete(x.id);
      return v;
    });
    for (const v of changed.values()) list.push(v);
    (next as unknown as Record<string, unknown>)[c] = list;
  }
  return next;
}
