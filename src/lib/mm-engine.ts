// Money Mondo write side: its people (with their jobs) and its money. Same
// rules as engine.ts: pure functions that check permissions and return a new
// database.
//
// People functions take the full database (a person may also work at Arena)
// plus the Money Mondo view, whose version of the actor carries their Money
// Mondo position. Money functions run on the Money Mondo view like any other
// write (see store.ts).

import { inArena } from "./business";
import { fail } from "./engine";
import {
  canEditExpense,
  canEditPickup,
  canEnterTransfersFor,
  canLogExpense,
  canLogPickup,
  canManageMmPerson,
  canSeeAllMoney,
  cashCounters,
  grantableJobs,
} from "./permissions";
import { idx } from "./selectors";
import { iso, ms } from "./time";
import type { Currency, Database, MmCash, MmCounter, MmExpense, MmJob, MmPickup, MmTransfers, User } from "./types";

const amount = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);
const count = (n: number) => Math.max(0, Math.round(Number(n) || 0));
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// --- People -------------------------------------------------------------------------

export interface MmPersonInput {
  /** An existing person (to edit, or an Arena person joining), or the id to give a new one. */
  id: string;
  name: string;
  jobs: MmJob[];
  phone?: string | null;
  pin_hash?: string | null; // set to change the PIN
}

export function saveMmPerson(full: Database, view: Database, actor: User, now: number, input: MmPersonInput): Database {
  const existing = full.users.find((u) => u.id === input.id);
  const inView = existing ? idx(view).userById.get(existing.id) : undefined;
  const joining = !!existing && existing.mm_jobs === undefined; // from Arena
  if (existing?.role === "owner") fail("Owners see all of Money Mondo already.");
  if (joining) {
    if (actor.role !== "owner") fail("Only an owner can bring someone from Arena.");
  } else if (!canManageMmPerson(actor, inView ?? null)) {
    fail("You are not allowed to manage this person.");
  }
  const allowed = new Set(grantableJobs(actor));
  const jobs = [...new Set(input.jobs)];
  if (jobs.length === 0) fail("Pick at least one job.");
  // Keep jobs the actor cannot give (e.g. a Mall Manager editing someone's PIN never removes an owner-given job).
  const kept = (existing?.mm_jobs ?? []).filter((j) => !allowed.has(j));
  if (jobs.some((j) => !allowed.has(j) && !kept.includes(j))) fail("You cannot give that job.");
  const all = [...new Set([...jobs.filter((j) => allowed.has(j)), ...kept])];
  if (all.includes("mall_manager") && all.includes("omt_manager")) fail("One person cannot be both the Mall Manager and the OMT Manager.");
  const taken = (job: MmJob) => all.includes(job) && full.users.some((u) => u.id !== input.id && u.active_status && u.mm_jobs?.includes(job));
  if (taken("mall_manager")) fail("There is already a Mall Manager.");
  if (taken("omt_manager")) fail("There is already an OMT Manager.");
  const name = input.name.trim();
  if (name.length < 2) fail("Enter a name.");
  if (full.users.some((u) => u.id !== input.id && u.active_status && u.name.trim().toLowerCase() === name.toLowerCase()))
    fail("Someone with this name already exists. Add a surname.");
  if (!existing && !input.pin_hash) fail("Set a 4-digit PIN.");
  const phone = input.phone?.trim() || null;

  if (existing) {
    const users = full.users.map((u) => {
      if (u.id !== existing.id) return u;
      const next: User = { ...u, name, mm_jobs: all, phone: phone ?? u.phone ?? null, pin_hash: input.pin_hash ?? u.pin_hash };
      if (!u.active_status) {
        // Coming back after leaving both businesses: back at Money Mondo only.
        next.active_status = true;
        next.left_arena = u.left_arena || u.in_arena !== false;
        next.in_arena = false;
      }
      return next;
    });
    return { ...full, users };
  }
  const person: User = {
    id: input.id,
    name,
    role: "employee", // Arena position; unused while in_arena is false
    title: "Money Mondo",
    department_id: null,
    manager_id: null,
    restaurant_id: null,
    avatar: String((full.users.length * 47 + 130) % 360),
    active_status: true,
    pin_hash: input.pin_hash ?? null,
    phone,
    created_at: iso(now),
    created_by: actor.id,
    in_arena: false,
    mm_jobs: all,
  };
  return { ...full, users: [...full.users, person] };
}

/** Take someone out of Money Mondo. Someone who also works at Arena keeps their Arena sign-in. */
export function removeFromMm(full: Database, view: Database, actor: User, userId: string): Database {
  const u = full.users.find((x) => x.id === userId);
  const inView = idx(view).userById.get(userId);
  if (!u || !inView) fail("This person no longer exists.");
  if (u!.id === actor.id) fail("You cannot remove yourself.");
  if (!canManageMmPerson(actor, inView!)) fail("You are not allowed to manage this person.");
  const stillArena = u!.active_status && inArena(u!);
  return {
    ...full,
    users: full.users.map((x) => (x.id === userId ? { ...x, mm_jobs: [], ...(stillArena ? {} : { active_status: false }) } : x)),
  };
}

// --- Money: pickups ---------------------------------------------------------------------

export interface PickupInput {
  collector_id: string;
  amount: number;
  currency: Currency;
  source: string;
  note: string;
  at: string;
}

export function logPickup(db: Database, actor: User, now: number, input: PickupInput): Database {
  if (!canLogPickup(actor)) fail("Only money collectors and managers log pickups.");
  const collector = idx(db).userById.get(input.collector_id);
  if (!collector?.active_status || !collector.mm_jobs?.includes("collector")) fail("Choose a money collector.");
  if (collector!.id !== actor.id && !canSeeAllMoney(actor)) fail("You can only log your own pickups.");
  if (amount(input.amount) <= 0) fail("Enter the amount.");
  if (input.source.trim().length < 2) fail("Where was it collected from?");
  if (Number.isNaN(ms(input.at))) fail("Set the time.");
  const p: MmPickup = {
    id: uid("pk"),
    at: input.at,
    collector_id: collector!.id,
    amount: amount(input.amount),
    currency: input.currency,
    source: input.source.trim(),
    note: input.note.trim(),
    handed_to: null,
    handed_at: null,
    confirmed_at: null,
    logged_by: actor.id,
    deleted_at: null,
  };
  return { ...db, mm_pickups: [...db.mm_pickups, p] };
}

function getPickup(db: Database, id: string): MmPickup {
  const p = db.mm_pickups.find((x) => x.id === id && !x.deleted_at);
  return p ?? fail("This pickup no longer exists.");
}

export function handOverPickup(db: Database, actor: User, now: number, id: string, toUserId: string): Database {
  const p = getPickup(db, id);
  if (!canEditPickup(actor, p)) fail("You cannot change this pickup.");
  const to = idx(db).userById.get(toUserId);
  if (!to?.active_status) fail("Choose who received the money.");
  if (to!.id === p.collector_id) fail("Choose someone other than the collector.");
  return {
    ...db,
    mm_pickups: db.mm_pickups.map((x) => (x.id === id ? { ...x, handed_to: to!.id, handed_at: iso(now), confirmed_at: null } : x)),
  };
}

/** The person who received the money confirms it. */
export function confirmPickup(db: Database, actor: User, now: number, id: string): Database {
  const p = getPickup(db, id);
  if (p.handed_to !== actor.id) fail("Only the person who received the money can confirm it.");
  if (p.confirmed_at) return db;
  return { ...db, mm_pickups: db.mm_pickups.map((x) => (x.id === id ? { ...x, confirmed_at: iso(now) } : x)) };
}

export function removePickup(db: Database, actor: User, now: number, id: string): Database {
  const p = getPickup(db, id);
  if (!canEditPickup(actor, p)) fail("A confirmed pickup cannot be removed.");
  return { ...db, mm_pickups: db.mm_pickups.map((x) => (x.id === id ? { ...x, deleted_at: iso(now) } : x)) };
}

// --- Money: daily cash per counter ------------------------------------------------------

export function setCash(db: Database, actor: User, now: number, date: string, counter: MmCounter, usd: number, lbp: number, note: string): Database {
  if (!cashCounters(actor).includes(counter)) fail("You cannot enter cash for this counter.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Pick a date.");
  const id = `${date}_${counter}`;
  const row: MmCash = { id, date, counter, usd: amount(usd), lbp: amount(lbp), note: note.trim(), entered_by: actor.id, updated_at: iso(now) };
  const exists = db.mm_cash.some((r) => r.id === id);
  return { ...db, mm_cash: exists ? db.mm_cash.map((r) => (r.id === id ? row : r)) : [...db.mm_cash, row] };
}

// --- Money: OMT transfers ---------------------------------------------------------------

export interface TransfersInput {
  date: string;
  operator_id: string;
  sent_count: number;
  sent_usd: number;
  sent_lbp: number;
  received_count: number;
  received_usd: number;
  received_lbp: number;
  note: string;
}

export function setTransfers(db: Database, actor: User, now: number, input: TransfersInput): Database {
  const op = idx(db).userById.get(input.operator_id);
  if (!op?.mm_jobs?.includes("omt")) fail("Choose an OMT Operator.");
  if (!canEnterTransfersFor(actor, op!)) fail("You can only enter your own transfers.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail("Pick a date.");
  const id = `${input.date}_${op!.id}`;
  const row: MmTransfers = {
    id,
    date: input.date,
    operator_id: op!.id,
    sent_count: count(input.sent_count),
    sent_usd: amount(input.sent_usd),
    sent_lbp: amount(input.sent_lbp),
    received_count: count(input.received_count),
    received_usd: amount(input.received_usd),
    received_lbp: amount(input.received_lbp),
    note: input.note.trim(),
    entered_by: actor.id,
    updated_at: iso(now),
  };
  const exists = db.mm_transfers.some((r) => r.id === id);
  return { ...db, mm_transfers: exists ? db.mm_transfers.map((r) => (r.id === id ? row : r)) : [...db.mm_transfers, row] };
}

// --- Money: expenses ------------------------------------------------------------------------

export interface ExpenseInput {
  date: string;
  amount: number;
  currency: Currency;
  category: string;
  note: string;
  counter: MmCounter | null;
}

export function logExpense(db: Database, actor: User, now: number, input: ExpenseInput): Database {
  if (!canLogExpense(actor)) fail("Sign in first.");
  if (amount(input.amount) <= 0) fail("Enter the amount.");
  if (input.category.trim().length < 2) fail("What was it for?");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail("Pick a date.");
  if (input.counter && !cashCounters(actor).includes(input.counter)) fail("You cannot take money from this counter.");
  const e: MmExpense = {
    id: uid("ex"),
    date: input.date,
    amount: amount(input.amount),
    currency: input.currency,
    category: input.category.trim(),
    note: input.note.trim(),
    counter: input.counter,
    logged_by: actor.id,
    at: iso(now),
    deleted_at: null,
  };
  return { ...db, mm_expenses: [...db.mm_expenses, e] };
}

export function removeExpense(db: Database, actor: User, now: number, id: string): Database {
  const e = db.mm_expenses.find((x) => x.id === id && !x.deleted_at);
  if (!e) fail("This expense no longer exists.");
  if (!canEditExpense(actor, e!)) fail("You cannot remove this expense.");
  return { ...db, mm_expenses: db.mm_expenses.map((x) => (x.id === id ? { ...x, deleted_at: iso(now) } : x)) };
}
