"use client";

// Dialogs for the calendar: book / edit an event (with its prep tasks), set a
// reminder, and create a recurring task.

import { BellPlus, CalendarPlus, Check, ChevronLeft, ChevronRight, Phone, Repeat as RepeatIcon, Trash2, Users, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Field, Money, Stepper, labelCls } from "@/components/forms";
import { Avatar, Btn, Chip, StatusBadge } from "@/components/kit";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { assignableDepartmentIds, canAssign, canDirect, canManageEvents, remindableUsers } from "@/lib/permissions";
import { idx, isOverdue } from "@/lib/selectors";
import { actions, useDb, useMe, useNow } from "@/lib/store";
import { addDays, beirutToUtc, dateKey, fmtDuration, fmtKey, fmtKeyShort, fmtMonth, fmtTime, fromInputs, MIN, ms, timeInputValue } from "@/lib/time";
import {
  AREA_LABEL,
  EVENT_KIND_COLOR,
  EVENT_KIND_LABEL,
  EVENT_STATUS_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  type Area,
  type EventKind,
  type EventStatus,
  type Priority,
  type RecurringTask,
  type Repeat,
  type User,
  type VenueEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PrepTaskInput } from "@/lib/venue-engine";
import { eventTasks, fmtMoney } from "@/lib/venue";

const KINDS: EventKind[] = ["birthday", "private", "school", "corporate", "tournament", "other"];
const AREAS: Area[] = ["playground", "restaurant", "sports", "whole_venue", "other"];
const STATUSES: EventStatus[] = ["booked", "confirmed", "done", "cancelled"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Department whose people usually handle an area. */
const areaDept = (a: Area) => (a === "restaurant" ? "restaurant" : a === "playground" ? "playground" : "ops");

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0b0f0d] p-4">{children}</div>;
}

/** People the signed-in person may give work to (and themselves for managers). */
function useAssignable(): User[] {
  const db = useDb();
  const me = useMe();
  return useMemo(
    () => db.users.filter((u) => u.active_status && (u.id === me.id || canDirect(me, u))).sort((a, b) => a.name.localeCompare(b.name)),
    [db.users, me],
  );
}

function PersonSelect({ value, onChange, people, label, allowNone }: { value: string; onChange: (id: string) => void; people: User[]; label: string; allowNone?: boolean }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {allowNone && <option value="">{t("No one yet")}</option>}
      {people.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {t(u.title)}
        </option>
      ))}
    </select>
  );
}

// --- Event ----------------------------------------------------------------------

interface PrepRow {
  on: boolean;
  title: string;
  offset: number; // minutes from start (negative = before), or from end when `after`
  after: boolean;
  est: number;
  assigned_to: string;
}

export function EventForm({ event, date, onDone }: { event: VenueEvent | null; date: string; onDone: () => void }) {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const people = useAssignable();
  const editable = canManageEvents(me);
  const [view, setView] = useState(!!event);

  const start0 = event ? ms(event.starts_at) : beirutToUtc(date, 15, 0);
  const end0 = event ? ms(event.ends_at) : start0 + 3 * 60 * MIN;
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "birthday");
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "booked");
  const [day, setDay] = useState(dateKey(start0));
  const [from, setFrom] = useState(timeInputValue(start0));
  const [to, setTo] = useState(timeInputValue(end0));
  const [area, setArea] = useState<Area>(event?.area ?? "playground");
  const [kids, setKids] = useState(event?.kids ?? 15);
  const [adults, setAdults] = useState(event?.adults ?? 10);
  const [contact, setContact] = useState(event?.contact_name ?? "");
  const [phone, setPhone] = useState(event?.contact_phone ?? "");
  const [price, setPrice] = useState(event?.package_price ?? 0);
  const [deposit, setDeposit] = useState(event?.deposit ?? 0);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const defaultOwner = () => {
    const dept = areaDept(area);
    const m = db.departments.find((d) => d.id === dept)?.manager_id;
    return people.some((u) => u.id === m) ? m! : me.id;
  };
  const [owner, setOwner] = useState(event?.owner_id ?? defaultOwner());

  const team = people.filter((u) => u.role === "employee" && (u.department_id === areaDept(area) || area === "whole_venue"));
  const firstStaff = (team[0] ?? people.find((u) => u.id !== me.id) ?? me).id;
  const [prep, setPrep] = useState<PrepRow[]>(() => [
    { on: true, title: t("Prepare the area"), offset: -60, after: false, est: 40, assigned_to: firstStaff },
    { on: true, title: t("Final setup check"), offset: -15, after: false, est: 15, assigned_to: firstStaff },
    { on: true, title: t("Clean up after the event"), offset: 30, after: true, est: 30, assigned_to: firstStaff },
  ]);

  const tasks = event ? eventTasks(db, event.id) : [];
  const i = idx(db);

  if (view && event) {
    const c = EVENT_KIND_COLOR[event.kind];
    return (
      <div>
        <div className="p-5 pb-2">
          <p className="eyebrow" style={{ color: c }}>
            {t(EVENT_KIND_LABEL[event.kind])} · {t(EVENT_STATUS_LABEL[event.status])}
          </p>
          <DialogTitle className="display mt-1 text-3xl">{event.title}</DialogTitle>
          <DialogDescription className="tnum mt-1 text-sm text-paper/60">
            {fmtKey(dateKey(event.starts_at))} · {fmtTime(event.starts_at)}–{fmtTime(event.ends_at)} · {t(AREA_LABEL[event.area])}
          </DialogDescription>
        </div>
        <div className="space-y-4 p-5">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              [t("Kids"), event.kids],
              [t("Adults"), event.adults],
              ...(me.role === "employee" ? [] : [[t("Package"), fmtMoney(event.package_price)], [t("Deposit"), fmtMoney(event.deposit)]]),
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <dt className="text-[11px] font-semibold tracking-wider text-paper/50 uppercase">{k}</dt>
                <dd className="tnum mt-1 font-display text-2xl font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          {(event.contact_name || event.contact_phone) && (
            <p className="flex items-center gap-2 text-sm text-paper/75">
              <Phone className="size-4 text-brand" /> {event.contact_name}
              {event.contact_phone && (
                <a className="tnum text-brand underline-offset-2 hover:underline" href={`tel:${event.contact_phone.replace(/\s/g, "")}`}>
                  {event.contact_phone}
                </a>
              )}
            </p>
          )}
          {event.owner_id && (
            <p className="flex items-center gap-2 text-sm text-paper/75">
              <Users className="size-4 text-brand" /> {t("In charge")}: <span className="font-semibold">{i.userById.get(event.owner_id)?.name}</span>
            </p>
          )}
          {event.notes && <p className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm whitespace-pre-wrap text-paper/75">{event.notes}</p>}
          <div>
            <p className={labelCls}>{t("Tasks for this event")}</p>
            {tasks.length === 0 ? (
              <p className="text-sm text-paper/50">{t("No tasks linked to this event.")}</p>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-2">
                    <Avatar user={task.assigned_to ? i.userById.get(task.assigned_to) : null} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    <span className="tnum text-xs text-paper/50">{fmtTime(task.due_at)}</span>
                    <StatusBadge status={task.status} overdue={isOverdue(task, now)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Footer>
          {editable && event.status !== "cancelled" && (
            <Btn variant="danger" onClick={() => actions.setEventStatus(event.id, "cancelled") && onDone()}>
              <Trash2 className="size-4" /> {t("Cancel event")}
            </Btn>
          )}
          <div className="ms-auto flex gap-2">
            <Btn onClick={onDone}>{t("Close")}</Btn>
            {editable && (
              <Btn variant="primary" onClick={() => setView(false)}>
                {t("Edit")}
              </Btn>
            )}
          </div>
        </Footer>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const starts_at = fromInputs(day, from);
    let ends_at = fromInputs(day, to);
    if (ms(ends_at) <= ms(starts_at)) ends_at = fromInputs(addDays(day, 1), to); // past midnight
    const input = {
      title,
      kind,
      status,
      starts_at,
      ends_at,
      area,
      kids,
      adults,
      contact_name: contact,
      contact_phone: phone,
      package_price: price,
      deposit,
      notes,
      owner_id: owner || null,
    };
    if (event) {
      if (actions.updateEvent(event.id, input)) onDone();
      return;
    }
    const prepTasks: PrepTaskInput[] = prep
      .filter((p) => p.on && p.title.trim())
      .map((p) => {
        const to = i.userById.get(p.assigned_to);
        const base = p.after ? ms(ends_at) : ms(starts_at);
        return {
          title: `${p.title.trim()} · ${title.trim()}`,
          description: t("For the event “{title}” ({kids} kids, {adults} adults).", { title: title.trim(), kids, adults }),
          department_id: to?.department_id ?? areaDept(area),
          assigned_to: p.assigned_to,
          due_at: new Date(base + p.offset * MIN).toISOString(),
          estimated_duration: p.est,
          priority: "high" as Priority,
        };
      });
    if (actions.createEvent(input, prepTasks)) onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="p-5 pb-0">
        <p className="eyebrow">{event ? t("Edit event") : t("New event")}</p>
        <DialogTitle className="display mt-1 text-3xl">{event ? event.title : t("Book an event")}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm text-paper/55">
          {t("Events show on everyone's calendar. The person in charge and the Operations Manager get a reminder the day before and an hour before.")}
        </DialogDescription>
      </div>
      <div className="space-y-5 p-5">
        <Field label={t("Event name")} htmlFor="ev-title">
          <input id="ev-title" className="field text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Lynn's 7th birthday")} required />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              <span className="size-2 rounded-full" style={{ background: EVENT_KIND_COLOR[k] }} /> {t(EVENT_KIND_LABEL[k])}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("Date")}>
            <input type="date" className="field" value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
          <Field label={t("From")}>
            <input type="time" className="field" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </Field>
          <Field label={t("To")}>
            <input type="time" className="field" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
        </div>
        <Field label={t("Where")}>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <Chip key={a} active={area === a} onClick={() => setArea(a)}>
                {t(AREA_LABEL[a])}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{t("Kids")}</span>
            <Stepper value={kids} onChange={setKids} label={t("Kids")} max={1000} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{t("Adults")}</span>
            <Stepper value={adults} onChange={setAdults} label={t("Adults")} max={1000} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Client name")}>
            <input className="field" value={contact} onChange={(e) => setContact(e.target.value)} />
          </Field>
          <Field label={t("Client phone")}>
            <input className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t("Package price")}>
            <Money value={price} onChange={setPrice} label={t("Package price")} />
          </Field>
          <Field label={t("Deposit paid")}>
            <Money value={deposit} onChange={setDeposit} label={t("Deposit paid")} />
          </Field>
        </div>
        <Field label={t("Person in charge")}>
          <PersonSelect value={owner} onChange={setOwner} people={people} label={t("Person in charge")} allowNone />
        </Field>
        <Field label={t("Notes")}>
          <textarea className="field min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Theme, cake, allergies, special requests…")} />
        </Field>
        {event && (
          <Field label={t("Status")}>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                  {t(EVENT_STATUS_LABEL[s])}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        {!event && (
          <div>
            <p className={labelCls}>{t("Tasks to assign with this event")}</p>
            <div className="space-y-2">
              {prep.map((p, n) => (
                <div key={n} className={cn("rounded-2xl border p-3 transition", p.on ? "border-brand/40 bg-brand/[0.06]" : "border-white/8 bg-white/[0.02] opacity-60")}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPrep((list) => list.map((x, k) => (k === n ? { ...x, on: !x.on } : x)))}
                      className={cn("grid size-6 shrink-0 place-items-center rounded-md border", p.on ? "border-brand bg-brand text-ink" : "border-white/25")}
                      aria-pressed={p.on}
                      aria-label={p.title}
                    >
                      {p.on && <Check className="size-4" />}
                    </button>
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      value={p.title}
                      onChange={(e) => setPrep((list) => list.map((x, k) => (k === n ? { ...x, title: e.target.value } : x)))}
                      aria-label={t("Task")}
                    />
                    <span className="tnum shrink-0 text-xs text-paper/50">
                      {p.after ? t("{n} min after", { n: p.offset }) : t("{n} min before", { n: -p.offset })} · {fmtDuration(p.est * 60)}
                    </span>
                  </div>
                  {p.on && (
                    <div className="mt-2">
                      <PersonSelect
                        value={p.assigned_to}
                        onChange={(id) => setPrep((list) => list.map((x, k) => (k === n ? { ...x, assigned_to: id } : x)))}
                        people={people}
                        label={t("Assign to")}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer>
        <div className="ms-auto flex gap-2">
          <Btn onClick={event ? () => setView(true) : onDone}>{t("Cancel")}</Btn>
          <Btn variant="primary" type="submit">
            <CalendarPlus className="size-4" /> {event ? t("Save") : t("Book event")}
          </Btn>
        </div>
      </Footer>
    </form>
  );
}

// --- Reminder -------------------------------------------------------------------

export function ReminderForm({ date, onDone }: { date: string; onDone: () => void }) {
  const db = useDb();
  const me = useMe();
  const people = useMemo(() => remindableUsers(db, me), [db, me]);
  const now = useNow();
  const today = dateKey(now);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(date < today ? today : date);
  const [time, setTime] = useState(() => (date === today ? timeInputValue(Math.ceil((now + 60 * MIN) / (15 * MIN)) * 15 * MIN) : "09:00"));
  const [who, setWho] = useState<string[]>([me.id]);
  const quick: [string, () => number][] = [
    [t("In 15 min"), () => Date.now() + 15 * MIN],
    [t("In 1 hour"), () => Date.now() + 60 * MIN],
    [t("Tonight 20:00"), () => beirutToUtc(today, 20, 0)],
    [t("Tomorrow 09:00"), () => beirutToUtc(addDays(today, 1), 9, 0)],
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (actions.createReminder({ title, note, at: fromInputs(day, time), for_user_ids: who })) onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="p-5 pb-0">
        <p className="eyebrow">{t("Reminder")}</p>
        <DialogTitle className="display mt-1 text-3xl">{t("Set a reminder")}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm text-paper/55">{t("It pops up on their phone at that time, and stays in the bell until they tick it off.")}</DialogDescription>
      </div>
      <div className="space-y-4 p-5">
        <Field label={t("Remind about")} htmlFor="rem-title">
          <input id="rem-title" className="field text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Call the balloon supplier")} required />
        </Field>
        <textarea className="field min-h-[56px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Details (optional)")} aria-label={t("Details")} />
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map(([name, at]) => (
              <Chip
                key={name}
                onClick={() => {
                  const v = at();
                  setDay(dateKey(v));
                  setTime(timeInputValue(v));
                }}
              >
                {name}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="field" value={day} onChange={(e) => setDay(e.target.value)} aria-label={t("Date")} required />
            <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("Time")} required />
          </div>
        </div>
        <Field label={t("Who gets it")}>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {people.map((u) => (
              <Chip key={u.id} active={who.includes(u.id)} onClick={() => setWho((w) => (w.includes(u.id) ? w.filter((x) => x !== u.id) : [...w, u.id]))}>
                {u.id === me.id ? t("Me") : u.name}
              </Chip>
            ))}
          </div>
        </Field>
      </div>
      <Footer>
        <div className="ms-auto flex gap-2">
          <Btn onClick={onDone}>{t("Cancel")}</Btn>
          <Btn variant="primary" type="submit" disabled={who.length === 0}>
            <BellPlus className="size-4" /> {t("Set reminder")}
          </Btn>
        </div>
      </Footer>
    </form>
  );
}

// --- Recurring task -------------------------------------------------------------

export function RecurringForm({ rule, onDone }: { rule: RecurringTask | null; onDone: () => void }) {
  const db = useDb();
  const me = useMe();
  const people = useAssignable().filter((u) => u.id !== me.id);
  const [title, setTitle] = useState(rule?.title ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [assignee, setAssignee] = useState(rule?.assigned_to ?? people[0]?.id ?? "");
  const [repeat, setRepeat] = useState<Repeat>(rule?.repeat ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [1]);
  const [monthDay, setMonthDay] = useState(rule?.month_day ?? 1);
  const [dates, setDates] = useState<string[]>(rule?.dates ?? []);
  const [time, setTime] = useState(rule?.due_time ?? "10:00");
  const [est, setEst] = useState(rule?.estimated_duration ?? 30);
  const [priority, setPriority] = useState<Priority>(rule?.priority ?? "high");
  const person = idx(db).userById.get(assignee);
  // Departments (on Money Mondo: teams) this person can get work in from me.
  const depts = useMemo(
    () => (assignee ? assignableDepartmentIds(db, me).filter((d) => canAssign(db, me, assignee, d)) : []),
    [db, me, assignee],
  );
  const [deptPick, setDeptPick] = useState(rule?.department_id ?? "");
  const dept = depts.includes(deptPick)
    ? deptPick
    : person?.department_id && depts.includes(person.department_id)
      ? person.department_id
      : (depts.find((d) => person?.department_ids?.includes(d)) ?? depts[0] ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = actions.saveRecurring(
      {
        title,
        description,
        department_id: dept,
        assigned_to: assignee,
        priority,
        repeat,
        weekdays,
        month_day: monthDay,
        dates,
        due_time: time,
        estimated_duration: est,
      },
      rule?.id,
    );
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="p-5 pb-0">
        <p className="eyebrow">{t("Recurring task")}</p>
        <DialogTitle className="display mt-1 text-3xl">{rule ? rule.title : t("A task that repeats")}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm text-paper/55">{t("Arena OS creates the task by itself each time it is due, in the person's queue.")}</DialogDescription>
      </div>
      <div className="space-y-4 p-5">
        <Field label={t("Task")} htmlFor="rc-title">
          <input id="rc-title" className="field text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Daily opening check")} required />
        </Field>
        <textarea className="field min-h-[56px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Instructions (optional)")} aria-label={t("Instructions")} />
        <Field label={t("Assign to")}>
          {people.length === 0 ? <p className="text-sm text-paper/55">{t("Add people to your team first.")}</p> : <PersonSelect value={assignee} onChange={setAssignee} people={people} label={t("Assign to")} />}
        </Field>
        {depts.length > 1 && (
          <Field label={t("Department")}>
            <div className="flex flex-wrap gap-1.5">
              {depts.map((d) => (
                <Chip key={d} active={dept === d} onClick={() => setDeptPick(d)}>
                  {t(idx(db).deptById.get(d)?.name ?? d)}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label={t("Repeats")}>
          <div className="flex flex-wrap gap-1.5">
            {(["daily", "weekly", "monthly", "custom"] as Repeat[]).map((r) => (
              <Chip key={r} active={repeat === r} onClick={() => setRepeat(r)}>
                {t({ daily: "Every day", weekly: "Every week", monthly: "Every month", custom: "Custom dates" }[r])}
              </Chip>
            ))}
          </div>
          {repeat === "weekly" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d, n) => (
                <Chip key={d} active={weekdays.includes(n)} onClick={() => setWeekdays((w) => (w.includes(n) ? w.filter((x) => x !== n) : [...w, n]))}>
                  {t(d)}
                </Chip>
              ))}
            </div>
          )}
          {repeat === "monthly" && (
            <label className="mt-2 flex items-center gap-2 text-sm text-paper/70">
              {t("On day")}
              <input type="number" min={1} max={28} className="field w-20 py-1.5 text-center" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value) || 1)} />
              {t("of each month")}
            </label>
          )}
          {repeat === "custom" && <MultiDatePicker value={dates} onChange={setDates} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Due at")}>
            <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
          <Field label={t("Time allowed (min)")}>
            <input type="number" min={1} max={600} className="field" value={est} onChange={(e) => setEst(Math.max(1, Number(e.target.value) || 0))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => (
            <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
              {t(PRIORITY_LABEL[p])}
            </Chip>
          ))}
        </div>
      </div>
      <Footer>
        <div className="ms-auto flex gap-2">
          <Btn onClick={onDone}>{t("Cancel")}</Btn>
          <Btn variant="primary" type="submit" disabled={!assignee || !dept || (repeat === "custom" && dates.length === 0)}>
            <RepeatIcon className="size-4" /> {rule ? t("Save") : t("Create schedule")}
          </Btn>
        </div>
      </Footer>
    </form>
  );
}


const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, like the calendar

/** Tap days to pick any set of dates (today onwards) for a custom schedule. */
function MultiDatePicker({ value, onChange }: { value: string[]; onChange: (dates: string[]) => void }) {
  const now = useNow();
  const today = dateKey(now);
  const [month, setMonth] = useState((value.find((d) => d >= today) ?? today).slice(0, 7));
  const first = `${month}-01`;
  const lead = WEEK_ORDER.indexOf(new Date(`${first}T12:00:00Z`).getUTCDay());
  const days = Array.from({ length: 42 }, (_, n) => addDays(first, n - lead));
  const picked = new Set(value);
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const toggle = (d: string) => onChange(picked.has(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  const upcoming = value.filter((d) => d >= today).sort();
  return (
    <div className="mt-2 rounded-2xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Btn size="sm" variant="subtle" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} aria-label={t("Previous month")}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Btn>
        <p className="text-sm font-semibold">{fmtMonth(first)}</p>
        <Btn size="sm" variant="subtle" onClick={() => shift(1)} aria-label={t("Next month")}>
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Btn>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_ORDER.map((d) => (
          <span key={d} className="text-[10px] font-semibold tracking-wider text-paper/40 uppercase">
            {t(WEEKDAYS[d])}
          </span>
        ))}
        {days.map((d) => {
          const out = d.slice(0, 7) !== month;
          const past = d < today;
          const on = picked.has(d);
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              aria-pressed={on}
              aria-label={fmtKey(d)}
              onClick={() => toggle(d)}
              className={cn(
                "tnum grid h-9 place-items-center rounded-xl text-sm transition",
                on ? "bg-brand font-bold text-ink" : "hover:bg-white/8",
                out && !on && "text-paper/30",
                past && "pointer-events-none opacity-25",
                d === today && !on && "ring-1 ring-brand/50 ring-inset",
              )}
            >
              {Number(d.slice(8, 10))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {upcoming.length === 0 ? (
          <p className="text-xs text-paper/50">{t("Tap the days the task should happen.")}</p>
        ) : (
          <>
            <span className="text-xs text-paper/55">{upcoming.length === 1 ? t("1 date") : t("{n} dates", { n: upcoming.length })}:</span>
            {upcoming.map((d) => (
              <Chip key={d} active onClick={() => toggle(d)} aria-label={t("Remove {date}", { date: fmtKey(d) })}>
                {fmtKeyShort(d)} <X className="size-3" />
              </Chip>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
