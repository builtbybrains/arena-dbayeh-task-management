// Money Mondo money: what each person may see, and the totals for a date range.
// Dollars and lira are always kept apart.

import { canSeeAllMoney, canSeeOmtMoney, canViewExpense, canViewPickup, cashCounters, isMm } from "./permissions";
import { dateKey } from "./time";
import type { Currency, Database, MmCash, MmCounter, MmExpense, MmPickup, MmTransfers, User } from "./types";

export const COUNTER_LABEL: Record<MmCounter, string> = { omt: "OMT", sales: "Sales", bb: "BB" };
export const COUNTERS: MmCounter[] = ["omt", "sales", "bb"];

export type Pair = Record<Currency, number>;
const pair = (): Pair => ({ USD: 0, LBP: 0 });

export function fmtAmount(n: number, currency: Currency): string {
  const v = Math.round(n * 100) / 100;
  if (currency === "USD") return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${Math.round(v).toLocaleString("en-US")} LBP`;
}

export function fmtPair(p: Pair): string {
  const parts = [p.USD ? fmtAmount(p.USD, "USD") : "", p.LBP ? fmtAmount(p.LBP, "LBP") : ""].filter(Boolean);
  return parts.length ? parts.join(" + ") : "$0";
}

const inRange = (key: string, from: string, to: string) => key >= from && key <= to;

export function pickupsFor(db: Database, u: User, from: string, to: string): MmPickup[] {
  return db.mm_pickups
    .filter((p) => !p.deleted_at && inRange(dateKey(p.at), from, to) && canViewPickup(u, p))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Money handed to this person that they have not confirmed yet, any day. */
export const awaitingMe = (db: Database, u: User) =>
  db.mm_pickups.filter((p) => !p.deleted_at && p.handed_to === u.id && !p.confirmed_at).sort((a, b) => (a.at < b.at ? 1 : -1));

/** Pickups still with a collector (not handed over or not yet confirmed), any day. */
export const notSettled = (db: Database, u: User) =>
  db.mm_pickups.filter((p) => !p.deleted_at && !p.confirmed_at && canViewPickup(u, p));

export function cashFor(db: Database, u: User, from: string, to: string): MmCash[] {
  const allowed = new Set(cashCounters(u));
  return db.mm_cash.filter((c) => allowed.has(c.counter) && inRange(c.date, from, to));
}

export function transfersFor(db: Database, u: User, from: string, to: string): MmTransfers[] {
  if (!isMm(u)) return [];
  return db.mm_transfers.filter((r) => inRange(r.date, from, to) && (canSeeOmtMoney(u) || r.operator_id === u.id));
}

export function expensesFor(db: Database, u: User, from: string, to: string): MmExpense[] {
  return db.mm_expenses
    .filter((e) => !e.deleted_at && inRange(e.date, from, to) && canViewExpense(u, e))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export interface MoneySummary {
  cash: Record<MmCounter, Pair>;
  cashTotal: Pair;
  cashDays: number; // days with at least one counter closed
  transfers: {
    sent_count: number;
    received_count: number;
    sent: Pair;
    received: Pair;
    byOperator: { operator_id: string; sent_count: number; received_count: number; sent: Pair; received: Pair }[];
  };
  pickups: { count: number; collected: Pair; confirmed: Pair; pending: Pair } | null; // null: not allowed to see
  expenses: { total: Pair; byCategory: { category: string; total: Pair }[] };
}

export function moneySummary(db: Database, u: User, from: string, to: string): MoneySummary {
  const cash = Object.fromEntries(COUNTERS.map((c) => [c, pair()])) as Record<MmCounter, Pair>;
  const cashTotal = pair();
  const days = new Set<string>();
  for (const c of cashFor(db, u, from, to)) {
    cash[c.counter].USD += c.usd;
    cash[c.counter].LBP += c.lbp;
    cashTotal.USD += c.usd;
    cashTotal.LBP += c.lbp;
    days.add(c.date);
  }
  const ops = new Map<string, MoneySummary["transfers"]["byOperator"][number]>();
  const transfers: MoneySummary["transfers"] = { sent_count: 0, received_count: 0, sent: pair(), received: pair(), byOperator: [] };
  for (const r of transfersFor(db, u, from, to)) {
    let o = ops.get(r.operator_id);
    if (!o) ops.set(r.operator_id, (o = { operator_id: r.operator_id, sent_count: 0, received_count: 0, sent: pair(), received: pair() }));
    for (const x of [o, transfers]) {
      x.sent_count += r.sent_count;
      x.received_count += r.received_count;
      x.sent.USD += r.sent_usd;
      x.sent.LBP += r.sent_lbp;
      x.received.USD += r.received_usd;
      x.received.LBP += r.received_lbp;
    }
  }
  transfers.byOperator = [...ops.values()].sort((a, b) => b.sent_count + b.received_count - (a.sent_count + a.received_count));
  let pickups: MoneySummary["pickups"] = null;
  if (canSeeAllMoney(u)) {
    pickups = { count: 0, collected: pair(), confirmed: pair(), pending: pair() };
    for (const p of pickupsFor(db, u, from, to)) {
      pickups.count++;
      pickups.collected[p.currency] += p.amount;
      (p.confirmed_at ? pickups.confirmed : pickups.pending)[p.currency] += p.amount;
    }
  }
  const total = pair();
  const cats = new Map<string, Pair>();
  for (const e of expensesFor(db, u, from, to)) {
    total[e.currency] += e.amount;
    const key = e.category.trim();
    if (!cats.has(key)) cats.set(key, pair());
    cats.get(key)![e.currency] += e.amount;
  }
  const byCategory = [...cats].map(([category, t]) => ({ category, total: t })).sort((a, b) => b.total.USD - a.total.USD || b.total.LBP - a.total.LBP);
  return { cash, cashTotal, cashDays: days.size, transfers, pickups, expenses: { total, byCategory } };
}
