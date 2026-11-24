// Read side for the venue: calendar days, how busy a day is, walk-in and
// revenue totals, reminders. Every number on the new screens comes from here.

import { t } from "./i18n";
import { isCompanyWide } from "./permissions";
import { employeeRows, idx, isOverdue, summarize, tasksInRange } from "./selectors";
import { addDays, beirutHour, dateKey, dayEnd, dayStart, ms } from "./time";
import type { Area, Database, EmployeeReportRow, Reminder, RevenueEntry, Task, User, VenueEvent, WalkIn } from "./types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const liveEvents = (db: Database) => db.events.filter((e) => !e.deleted_at);
export const liveWalkIns = (db: Database) => db.walkins.filter((w) => !w.deleted_at);

export function eventsOnDay(db: Database, key: string, withCancelled = false): VenueEvent[] {
  return liveEvents(db)
    .filter((e) => dateKey(e.starts_at) === key && (withCancelled || e.status !== "cancelled"))
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
}

export function eventsInRange(db: Database, from: string, to: string, withCancelled = false): VenueEvent[] {
  return liveEvents(db)
    .filter((e) => {
      const k = dateKey(e.starts_at);
      return k >= from && k <= to && (withCancelled || e.status !== "cancelled");
    })
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
}

export function walkInsInRange(db: Database, from: string, to: string): WalkIn[] {
  const a = dayStart(from);
  const b = dayEnd(to);
  return liveWalkIns(db)
    .filter((w) => ms(w.at) >= a && ms(w.at) < b)
    .sort((x, y) => ms(y.at) - ms(x.at));
}

export const people = (w: { kids: number; adults: number }) => w.kids + w.adults;

/** "2 kids, 1 adult" in the current language. */
export function fmtParty(kids: number, adults: number): string {
  const k = kids === 1 ? t("1 kid") : t("{n} kids", { n: kids });
  const a = adults === 1 ? t("1 adult") : t("{n} adults", { n: adults });
  return `${k}${t(", ")}${a}`;
}

export interface WalkInTotals {
  visits: number; // entries logged
  kids: number;
  adults: number;
  people: number;
  amount: number;
}

export function walkInTotals(list: WalkIn[]): WalkInTotals {
  const kids = sum(list.map((w) => w.kids));
  const adults = sum(list.map((w) => w.adults));
  return { visits: list.length, kids, adults, people: kids + adults, amount: sum(list.map((w) => w.amount)) };
}

/** Tasks that belong to an event (prep, setup, cleanup). */
export const eventTasks = (db: Database, eventId: string): Task[] =>
  idx(db).live.filter((t) => t.event_id === eventId);

// --- How busy is a day --------------------------------------------------------

export type BusyLevel = "quiet" | "normal" | "busy" | "packed";
export const BUSY_LABEL: Record<BusyLevel, string> = { quiet: "Quiet", normal: "Normal", busy: "Busy", packed: "Very busy" };
export const BUSY_COLOR: Record<BusyLevel, string> = { quiet: "#5aa9ff", normal: "#22c73f", busy: "#ffc24b", packed: "#ff4d5e" };

export interface DayLoad {
  date: string;
  events: VenueEvent[];
  event_guests: number;
  walkins: number; // people who walked in (actual for past days and today)
  expected_walkins: number; // average for this weekday over the last four weeks
  total: number; // what the day is judged on
  level: BusyLevel;
  forecast: boolean; // true when walk-ins are an estimate
}

/** Walk-in people per business date, for every logged walk-in. */
function walkInsByDay(db: Database): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of liveWalkIns(db)) {
    const k = dateKey(w.at);
    m.set(k, (m.get(k) ?? 0) + people(w));
  }
  return m;
}

export function dayLoads(db: Database, from: string, to: string, now: number): DayLoad[] {
  const today = dateKey(now);
  const byDay = walkInsByDay(db);
  const events = eventsInRange(db, from, to);
  // Baseline: average people per day across the last 28 days that had any record.
  const past: number[] = [];
  for (let d = 1; d <= 28; d++) {
    const k = addDays(today, -d);
    const guests = sum(eventsOnDay(db, k).map(people));
    const v = (byDay.get(k) ?? 0) + guests;
    if (v > 0) past.push(v);
  }
  const baseline = past.length >= 3 ? sum(past) / past.length : 0;
  const out: DayLoad[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const evs = events.filter((e) => dateKey(e.starts_at) === k);
    const event_guests = sum(evs.map(people));
    const sameDay: number[] = [];
    for (let w = 1; w <= 4; w++) {
      const v = byDay.get(addDays(k, -7 * w));
      if (v !== undefined && addDays(k, -7 * w) < today) sameDay.push(v);
    }
    const expected = sameDay.length ? Math.round(sum(sameDay) / sameDay.length) : 0;
    const actual = byDay.get(k) ?? 0;
    const forecast = k > today;
    // Today counts whichever is larger: what came so far or the usual.
    const walkins = forecast ? expected : k === today ? Math.max(actual, expected) : actual;
    const total = walkins + event_guests;
    let level: BusyLevel;
    if (baseline > 0) {
      const r = total / baseline;
      level = r < 0.6 ? "quiet" : r < 1.2 ? "normal" : r < 1.8 ? "busy" : "packed";
    } else {
      level = total < 40 ? "quiet" : total < 120 ? "normal" : total < 250 ? "busy" : "packed";
    }
    if (total === 0) level = "quiet";
    out.push({ date: k, events: evs, event_guests, walkins: forecast ? 0 : actual, expected_walkins: expected, total, level, forecast });
  }
  return out;
}

// --- Reminders ----------------------------------------------------------------

export interface ReminderItem {
  id: string;
  title: string;
  note: string;
  at: number;
  kind: "reminder" | "event" | "task_due";
  reminder?: Reminder;
  task_id?: string;
  event_id?: string | null;
}

/** Stored reminders for this person that are not dismissed yet. */
export function remindersFor(db: Database, user: User): Reminder[] {
  return db.reminders
    .filter((r) => !r.deleted_at && r.for_user_ids.includes(user.id) && !r.done_by.includes(user.id))
    .sort((a, b) => ms(a.at) - ms(b.at));
}

/**
 * What is due for this person right now: their reminders that have fired, plus
 * their own tasks due within 30 minutes that have not started.
 */
export function dueReminders(db: Database, user: User, now: number): ReminderItem[] {
  const out: ReminderItem[] = remindersFor(db, user)
    .filter((r) => ms(r.at) <= now)
    .map((r) => ({ id: r.id, title: r.title, note: r.note, at: ms(r.at), kind: r.event_id ? "event" : "reminder", reminder: r, event_id: r.event_id }));
  for (const task of idx(db).live) {
    if (task.assigned_to !== user.id || task.status !== "pending" || isOverdue(task, now)) continue;
    const due = ms(task.due_at);
    if (due - now <= 30 * 60_000) {
      out.push({
        id: `due_${task.id}`,
        title: t("Due soon: {title}", { title: task.title }),
        note: t("Not started yet."),
        at: due - 30 * 60_000,
        kind: "task_due",
        task_id: task.id,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

// --- Business report ------------------------------------------------------------

export interface BusinessReport {
  from: string;
  to: string;
  days: number;
  tasks: { assigned: number; completed: number; overdue: number; delayed: number; completion_rate: number };
  people: EmployeeReportRow[];
  events: {
    list: VenueEvent[];
    count: number;
    cancelled: number;
    guests: number;
    kids: number;
    adults: number;
    revenue: number;
    deposits: number;
    tasks: number;
    tasks_on_time: number;
  };
  walkins: WalkInTotals & {
    per_day: { date: string; people: number; amount: number }[];
    per_hour: { hour: number; people: number }[];
    per_area: { area: Area; people: number; amount: number }[];
    busiest_day: { date: string; people: number } | null;
    busiest_hour: number | null;
  };
  revenue: {
    door: number;
    events: number;
    restaurant: number;
    other: number;
    total: number;
    per_day: { date: string; door: number; events: number; restaurant: number; other: number; total: number }[];
    entries: RevenueEntry[];
  };
}

export function businessReport(db: Database, viewer: User, from: string, to: string, now: number): BusinessReport {
  const days: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) days.push(k);
  const inScope = (t: Task) => isCompanyWide(viewer) || t.department_id === viewer.department_id;
  const tasks = tasksInRange(db, from, to, inScope);
  const s = summarize(db, tasks, now);

  const visible = db.users.filter(
    (u) =>
      u.active_status &&
      u.role !== "owner" &&
      (isCompanyWide(viewer) ? true : u.department_id === viewer.department_id),
  );
  const rows = employeeRows(db, visible, from, to, now)
    .filter((r) => r.assigned > 0)
    .sort((a, b) => b.completed - a.completed || b.assigned - a.assigned);

  const allEvents = eventsInRange(db, from, to, true);
  const evs = allEvents.filter((e) => e.status !== "cancelled");
  const evTasks = evs.flatMap((e) => eventTasks(db, e.id));
  const onTime = evTasks.filter((t) => t.status === "completed" && t.completed_at && ms(t.completed_at) <= ms(t.due_at)).length;

  const walk = walkInsInRange(db, from, to);
  const totals = walkInTotals(walk);
  const perDay = days.map((d) => {
    const list = walk.filter((w) => dateKey(w.at) === d);
    return { date: d, people: sum(list.map(people)), amount: sum(list.map((w) => w.amount)) };
  });
  const hours = new Map<number, number>();
  for (const w of walk) hours.set(beirutHour(ms(w.at)), (hours.get(beirutHour(ms(w.at))) ?? 0) + people(w));
  const perHour = [...hours.entries()].map(([hour, p]) => ({ hour, people: p })).sort((a, b) => a.hour - b.hour);
  const areas = new Map<Area, { people: number; amount: number }>();
  for (const w of walk) {
    const a = areas.get(w.area) ?? { people: 0, amount: 0 };
    areas.set(w.area, { people: a.people + people(w), amount: a.amount + w.amount });
  }
  const busiestDay = perDay.reduce<{ date: string; people: number } | null>((m, d) => (d.people > (m?.people ?? 0) ? d : m), null);
  const busiestHour = perHour.reduce<{ hour: number; people: number } | null>((m, h) => (h.people > (m?.people ?? 0) ? h : m), null);

  const entries = db.revenue.filter((r) => r.date >= from && r.date <= to);
  const revDays = days.map((d) => {
    const door = perDay.find((p) => p.date === d)?.amount ?? 0;
    const events = sum(evs.filter((e) => dateKey(e.starts_at) === d).map((e) => e.package_price));
    const restaurant = sum(entries.filter((r) => r.date === d && r.source === "restaurant").map((r) => r.amount));
    const other = sum(entries.filter((r) => r.date === d && r.source === "other").map((r) => r.amount));
    return { date: d, door, events, restaurant, other, total: door + events + restaurant + other };
  });

  return {
    from,
    to,
    days: days.length,
    tasks: { assigned: s.assigned, completed: s.completed, overdue: s.overdue, delayed: s.delayed, completion_rate: s.completion_rate },
    people: rows,
    events: {
      list: allEvents,
      count: evs.length,
      cancelled: allEvents.length - evs.length,
      guests: sum(evs.map(people)),
      kids: sum(evs.map((e) => e.kids)),
      adults: sum(evs.map((e) => e.adults)),
      revenue: sum(evs.map((e) => e.package_price)),
      deposits: sum(evs.map((e) => e.deposit)),
      tasks: evTasks.length,
      tasks_on_time: onTime,
    },
    walkins: {
      ...totals,
      per_day: perDay,
      per_hour: perHour,
      per_area: [...areas.entries()].map(([area, v]) => ({ area, ...v })).sort((a, b) => b.people - a.people),
      busiest_day: busiestDay && busiestDay.people > 0 ? busiestDay : null,
      busiest_hour: busiestHour?.hour ?? null,
    },
    revenue: {
      door: sum(revDays.map((d) => d.door)),
      events: sum(revDays.map((d) => d.events)),
      restaurant: sum(revDays.map((d) => d.restaurant)),
      other: sum(revDays.map((d) => d.other)),
      total: sum(revDays.map((d) => d.total)),
      per_day: revDays,
      entries,
    },
  };
}

export const fmtMoney = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
