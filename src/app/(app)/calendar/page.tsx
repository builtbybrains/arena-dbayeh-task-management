"use client";

import {
  BellPlus,
  BellRing,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Btn, Empty, PageHeader, Panel, PriorityBadge, Segmented, StatusBadge } from "@/components/kit";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventForm, ReminderForm, WEEKDAYS } from "@/components/venue-dialogs";
import { t } from "@/lib/i18n";
import { canManageEvents, canViewTask } from "@/lib/permissions";
import { idx, isOverdue, sortTasks } from "@/lib/selectors";
import { actions, useDb, useMe, useNow } from "@/lib/store";
import { addDays, dateKey, fmtDay, fmtKeyLong, fmtMonth, fmtTime, ms } from "@/lib/time";
import { AREA_LABEL, EVENT_KIND_COLOR, EVENT_KIND_LABEL, type VenueEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BUSY_COLOR, BUSY_LABEL, dayLoads, fmtParty, remindersFor, type DayLoad } from "@/lib/venue";

type Tab = "month" | "reminders";
type Modal = { kind: "event"; event: VenueEvent | null } | { kind: "reminder" } | null;

// Weeks start on Monday at Arena.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function CalendarPage() {
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const [tab, setTab] = useState<Tab>("month");

  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);

  const tabs: { value: Tab; label: string }[] = [
    { value: "month", label: t("Calendar") },
    { value: "reminders", label: t("Reminders") },
  ];

  return (
    <>
      <PageHeader eyebrow={t("Calendar")} title={t("Events, deadlines and reminders")} sub={t("Book events, see how busy each day will be, and never miss a reminder.")}>
        {canManageEvents(me) && (
          <Btn variant="primary" onClick={() => setModal({ kind: "event", event: null })}>
            <CalendarPlus className="size-4" /> {t("Book event")}
          </Btn>
        )}
        <Btn onClick={() => setModal({ kind: "reminder" })}>
          <BellPlus className="size-4" /> {t("Reminder")}
        </Btn>
      </PageHeader>
      <Segmented id="cal-tab" className="mb-4" value={tab} onChange={setTab} options={tabs} />

      {tab === "month" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <MonthGrid month={month} setMonth={setMonth} selected={selected} onSelect={setSelected} />
          <DayPanel date={selected} onEvent={(event) => setModal({ kind: "event", event })} onNew={() => setModal({ kind: "event", event: null })} />
        </div>
      )}
      {tab === "reminders" && <RemindersTab />}

      <Dialog open={modal !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="glass-solid block max-h-[92dvh] overflow-x-hidden overflow-y-auto rounded-3xl p-0 sm:max-w-xl">
          {modal?.kind === "event" && <EventForm event={modal.event} date={selected < today ? today : selected} onDone={close} />}
          {modal?.kind === "reminder" && <ReminderForm date={selected} onDone={close} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MonthGrid({ month, setMonth, selected, onSelect }: { month: string; setMonth: (m: string) => void; selected: string; onSelect: (d: string) => void }) {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const first = `${month}-01`;
  const lead = ORDER.indexOf(new Date(`${first}T12:00:00Z`).getUTCDay());
  const start = addDays(first, -lead);
  const days = useMemo(() => Array.from({ length: 42 }, (_, n) => addDays(start, n)), [start]);
  const loads = useMemo(() => new Map(dayLoads(db, days[0], days[41], now).map((l) => [l.date, l])), [db, days, now]);
  const dueByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const task of idx(db).live) {
      if (task.status === "completed" || !canViewTask(me, task)) continue;
      const k = dateKey(task.due_at);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [db, me]);
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const lastRow = days.slice(35).every((d) => d.slice(0, 7) !== month) ? 35 : 42;

  return (
    <Panel
      title={fmtMonth(first)}
      icon={<CalendarDays className="size-5" />}
      right={
        <div className="flex items-center gap-1">
          <Btn size="sm" variant="subtle" onClick={() => shift(-1)} aria-label={t("Previous month")}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Btn>
          <Btn
            size="sm"
            onClick={() => {
              setMonth(today.slice(0, 7));
              onSelect(today);
            }}
          >
            {t("Today")}
          </Btn>
          <Btn size="sm" variant="subtle" onClick={() => shift(1)} aria-label={t("Next month")}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Btn>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wider text-paper/45 uppercase sm:text-[11px]">
        {ORDER.map((d) => (
          <div key={d} className="pb-1">
            {t(WEEKDAYS[d])}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.slice(0, lastRow).map((d) => {
          const load = loads.get(d);
          const inMonth = d.slice(0, 7) === month;
          const due = dueByDay.get(d) ?? 0;
          const on = d === selected;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={on}
              aria-label={`${fmtKeyLong(d)}${load?.events.length ? ` · ${t("{n} events", { n: load.events.length })}` : ""}`}
              className={cn(
                "relative flex min-h-[58px] flex-col items-stretch rounded-xl border p-1 text-start transition sm:min-h-[92px] sm:p-1.5",
                on ? "border-brand/80 bg-brand/12" : "border-white/6 bg-white/[0.025] hover:border-white/20",
                !inMonth && "opacity-35",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("tnum grid size-6 place-items-center rounded-full text-xs font-bold", d === today && "bg-brand text-ink")}>{Number(d.slice(8))}</span>
                {load && load.total > 0 && <span className="size-2 rounded-full" style={{ background: BUSY_COLOR[load.level] }} title={t(BUSY_LABEL[load.level])} />}
              </span>
              <span className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                {load?.events.slice(0, 2).map((e) => (
                  <span key={e.id} className="truncate rounded px-1 text-[10px] leading-4 font-semibold text-ink" style={{ background: EVENT_KIND_COLOR[e.kind] }}>
                    {fmtTime(e.starts_at)} {e.title}
                  </span>
                ))}
                {load && load.events.length > 2 && <span className="text-[10px] text-paper/50">+{load.events.length - 2}</span>}
              </span>
              <span className="mt-auto flex items-center gap-1 sm:hidden">
                {load?.events.slice(0, 3).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full" style={{ background: EVENT_KIND_COLOR[e.kind] }} />
                ))}
              </span>
              {due > 0 && (
                <span className="tnum absolute end-1 bottom-1 hidden rounded bg-white/10 px-1 text-[9px] text-paper/70 sm:block">
                  {t("{n} due", { n: due })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-paper/55">
        {(Object.keys(BUSY_LABEL) as (keyof typeof BUSY_LABEL)[]).map((l) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: BUSY_COLOR[l] }} /> {t(BUSY_LABEL[l])}
          </span>
        ))}
        <span className="text-paper/40">{t("Busy = event guests + usual walk-ins for that weekday")}</span>
      </div>
    </Panel>
  );
}

function DayPanel({ date, onEvent, onNew }: { date: string; onEvent: (e: VenueEvent) => void; onNew: () => void }) {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const i = idx(db);
  const load: DayLoad | undefined = useMemo(() => dayLoads(db, date, date, now)[0], [db, date, now]);
  const tasks = useMemo(
    () => sortTasks(i.live.filter((task) => dateKey(task.due_at) === date && canViewTask(me, task))),
    [i, date, me],
  );
  const reminders = useMemo(() => remindersFor(db, me).filter((r) => dateKey(r.at) === date), [db, me, date]);
  const today = dateKey(now);

  return (
    <div className="space-y-4 xl:sticky xl:top-20">
      <Panel title={fmtKeyLong(date)}>
        {load && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full font-display text-lg font-bold text-ink" style={{ background: BUSY_COLOR[load.level] }}>
              <Users className="size-5" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{t(BUSY_LABEL[load.level])}</p>
              <p className="text-xs text-paper/55">
                {load.event_guests > 0 && t("{n} event guests", { n: load.event_guests })}
                {load.event_guests > 0 && " · "}
                {date < today
                  ? t("{n} walk-ins", { n: load.walkins })
                  : date === today
                    ? t("{n} walk-ins so far (usually {m})", { n: load.walkins, m: load.expected_walkins })
                    : t("about {n} walk-ins expected", { n: load.expected_walkins })}
              </p>
            </div>
          </div>
        )}
        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{t("Events")}</p>
        {load && load.events.length > 0 ? (
          <ul className="space-y-2">
            {load.events.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEvent(e)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-start transition hover:border-white/25"
                >
                  <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: EVENT_KIND_COLOR[e.kind] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.title}</span>
                    <span className="tnum block text-xs text-paper/55">
                      {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)} · {t(AREA_LABEL[e.area])} · {t(EVENT_KIND_LABEL[e.kind])}
                    </span>
                    <span className="block text-xs text-paper/45">
                      {fmtParty(e.kids, e.adults)}
                      {e.owner_id && ` · ${i.userById.get(e.owner_id)?.name ?? ""}`}
                    </span>
                  </span>
                  <Pencil className="size-4 shrink-0 text-paper/35" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-white/12 p-3 text-sm text-paper/50">
            {t("No events this day.")}
            {canManageEvents(me) && date >= today && (
              <Btn size="sm" onClick={onNew}>
                <Plus className="size-4" /> {t("Book")}
              </Btn>
            )}
          </div>
        )}

        <p className="mt-4 mb-2 text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{t("Tasks due")}</p>
        {tasks.length === 0 ? (
          <p className="text-sm text-paper/45">{t("Nothing due.")}</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.slice(0, 12).map((task) => (
              <li key={task.id} className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-2">
                <Avatar user={task.assigned_to ? i.userById.get(task.assigned_to) : null} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{task.title}</span>
                  <span className="tnum text-[11px] text-paper/50">{fmtTime(task.due_at)}</span>
                </span>
                <PriorityBadge priority={task.priority} className="hidden sm:inline-flex" />
                <StatusBadge status={task.status} overdue={isOverdue(task, now)} />
              </li>
            ))}
            {tasks.length > 12 && <li className="text-xs text-paper/45">{t("+{n} more", { n: tasks.length - 12 })}</li>}
          </ul>
        )}

        {reminders.length > 0 && (
          <>
            <p className="mt-4 mb-2 text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{t("My reminders")}</p>
            <ul className="space-y-1.5">
              {reminders.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 rounded-xl border border-med/30 bg-med/8 p-2 text-sm">
                  <BellRing className="size-4 shrink-0 text-med" />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="tnum text-xs text-paper/50">{fmtTime(r.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function RemindersTab() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const i = idx(db);
  const mine = remindersFor(db, me);
  const sent = db.reminders
    .filter((r) => !r.deleted_at && r.created_by === me.id && !(r.for_user_ids.length === 1 && r.for_user_ids[0] === me.id) && ms(r.at) > now - 3 * 86_400_000)
    .sort((a, b) => ms(a.at) - ms(b.at));
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Panel title={t("For me")} icon={<BellRing className="size-5" />}>
        {mine.length === 0 ? (
          <Empty title={t("No reminders")} hint={t("Reminders you set, or that others set for you, appear here.")} />
        ) : (
          <ul className="space-y-2">
            {mine.map((r) => {
              const due = ms(r.at) <= now;
              return (
                <li key={r.id} className={cn("flex items-start gap-3 rounded-2xl border p-3", due ? "border-med/40 bg-med/10" : "border-white/8 bg-white/[0.03]")}>
                  <BellRing className={cn("mt-0.5 size-4 shrink-0", due ? "text-med" : "text-paper/40")} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.title}</p>
                    {r.note && <p className="text-sm text-paper/60">{r.note}</p>}
                    <p className="tnum mt-0.5 text-xs text-paper/45">
                      {fmtDay(r.at)} {fmtTime(r.at)}
                      {r.created_by !== me.id && ` · ${t("from {name}", { name: i.userById.get(r.created_by)?.name ?? "" })}`}
                    </p>
                  </div>
                  <Btn size="sm" variant={due ? "primary" : "subtle"} onClick={() => actions.dismissReminder(r.id)}>
                    {t("Done")}
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title={t("I set for others")} icon={<Users className="size-5" />}>
        {sent.length === 0 ? (
          <Empty title={t("None")} hint={t("Use “Reminder” to remind someone on your team.")} />
        ) : (
          <ul className="space-y-2">
            {sent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <p className="tnum text-xs text-paper/45">
                    {fmtDay(r.at)} {fmtTime(r.at)} ·{" "}
                    {r.for_user_ids
                      .map((id) => {
                        const n = i.userById.get(id)?.name ?? "";
                        return r.done_by.includes(id) ? `${n} ✓` : n;
                      })
                      .join(t(", "))}
                  </p>
                </div>
                <Btn size="sm" variant="subtle" onClick={() => actions.deleteReminder(r.id)} aria-label={t("Delete")}>
                  <Trash2 className="size-4" />
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
