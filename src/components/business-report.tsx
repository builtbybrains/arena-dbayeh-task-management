"use client";

// Reports on dates: pick any range and see tasks per person, events, walk-ins
// and revenue for it. Export to CSV or print / save as PDF.

import { CalendarRange, DoorOpen, Download, PartyPopper, Printer, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, Chip, Empty, PageHeader, Panel, Stat } from "@/components/kit";
import { downloadCsv, rangeSlug, toMinutes, toPercent, type CsvRows } from "@/lib/export";
import { t } from "@/lib/i18n";
import { canSeeRevenue } from "@/lib/permissions";
import { idx } from "@/lib/selectors";
import { useDb, useMe, useNow } from "@/lib/store";
import { addDays, dateKey, fmtDay, fmtDuration, fmtKey, fmtKeyShort, fmtTime } from "@/lib/time";
import { AREA_LABEL, EVENT_KIND_COLOR, EVENT_KIND_LABEL, EVENT_STATUS_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { businessReport, fmtMoney, fmtParty } from "@/lib/venue";

type Preset = "today" | "yesterday" | "week" | "7d" | "month" | "last_month" | "custom";

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "week":
      return { from: addDays(today, -dow), to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "last_month": {
      const end = addDays(monthStart, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    default:
      return { from: today, to: today };
  }
}

export function BusinessReportView() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState(() => presetRange("7d", today));
  const { from, to } = preset === "custom" ? custom : presetRange(preset, today);
  const r = useMemo(() => businessReport(db, me, from, to, now), [db, me, from, to, now]);
  const money = canSeeRevenue(me);
  const i = idx(db);
  const maxDay = Math.max(1, ...r.walkins.per_day.map((d) => d.people));

  const presets: [Preset, string][] = [
    ["today", t("Today")],
    ["yesterday", t("Yesterday")],
    ["week", t("This week")],
    ["7d", t("Last 7 days")],
    ["month", t("This month")],
    ["last_month", t("Last month")],
    ["custom", t("Pick dates")],
  ];
  const rangeText = from === to ? fmtKey(from) : `${fmtKeyShort(from)} – ${fmtKeyShort(to)}`;

  const exportCsv = () => {
    const rows: CsvRows = [
      ["Arena OS report", `${from} to ${to}`],
      [],
      ["Tasks per person"],
      ["Name", "Title", "Assigned", "Completed", "Overdue", "Late", "Completion %", "Tracked minutes"],
      ...r.people.map((p) => [p.name, p.title, p.assigned, p.completed, p.overdue, p.delayed, toPercent(p.completion_rate), toMinutes(p.active_seconds)]),
      [],
      ["Events"],
      ["Date", "Start", "End", "Event", "Type", "Status", "Area", "Kids", "Adults", ...(money ? ["Package USD", "Deposit USD"] : []), "Client", "Phone"],
      ...r.events.list.map((e) => [
        dateKey(e.starts_at),
        fmtTime(e.starts_at),
        fmtTime(e.ends_at),
        e.title,
        EVENT_KIND_LABEL[e.kind],
        EVENT_STATUS_LABEL[e.status],
        AREA_LABEL[e.area],
        e.kids,
        e.adults,
        ...(money ? [e.package_price, e.deposit] : []),
        e.contact_name,
        e.contact_phone,
      ]),
      [],
      ["Walk-ins per day"],
      ["Date", "People", ...(money ? ["Paid at door USD"] : [])],
      ...r.walkins.per_day.map((d) => [d.date, d.people, ...(money ? [d.amount] : [])]),
    ];
    if (money) {
      rows.push(
        [],
        ["Revenue per day (USD)"],
        ["Date", "Door", "Events", "Restaurant", "Other", "Total"],
        ...r.revenue.per_day.map((d) => [d.date, d.door, d.events, d.restaurant, d.other, d.total]),
        ["Total", r.revenue.door, r.revenue.events, r.revenue.restaurant, r.revenue.other, r.revenue.total],
      );
    }
    downloadCsv(`arena-os-report-${rangeSlug(from, to)}`, rows);
    toast.success(t("CSV exported."));
  };

  return (
    <div className="print-root">
      <PageHeader eyebrow={t("Reports")} title={t("Report for {range}", { range: rangeText })} sub={t("Tasks, events, walk-ins and revenue for the dates you pick.")}>
        <Btn onClick={exportCsv}>
          <Download className="size-4" /> {t("Export CSV")}
        </Btn>
        <Btn onClick={() => window.print()}>
          <Printer className="size-4" /> {t("Print / PDF")}
        </Btn>
      </PageHeader>

      <div className="no-print mb-5 flex flex-wrap items-center gap-1.5">
        <CalendarRange className="me-1 size-4 text-brand" />
        {presets.map(([p, label]) => (
          <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>
            {label}
          </Chip>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" className="field h-8 w-auto py-0 text-xs" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label={t("From")} />
            –
            <input type="date" className="field h-8 w-auto py-0 text-xs" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label={t("To")} />
          </span>
        )}
      </div>

      <div className={cn("mb-4 grid grid-cols-2 gap-3", money ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <Stat label={t("Tasks done")} value={r.tasks.completed} sub={t("{rate}% of {n} assigned", { rate: Math.round(r.tasks.completion_rate), n: r.tasks.assigned })} tone="brand" />
        <Stat label={t("Events")} value={r.events.count} sub={t("{n} guests", { n: r.events.guests })} icon={<PartyPopper className="size-4" />} />
        <Stat label={t("Walk-ins")} value={r.walkins.people} sub={fmtParty(r.walkins.kids, r.walkins.adults)} icon={<DoorOpen className="size-4" />} />
        {money && <Stat label={t("Revenue")} value={r.revenue.total} format={(n) => fmtMoney(n)} icon={<Wallet className="size-4" />} tone="brand" />}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Panel title={t("Tasks per person")} icon={<Users className="size-5" />} className="xl:col-span-2">
          {r.people.length === 0 ? (
            <Empty title={t("No tasks in this range")} />
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-start text-[11px] tracking-wider text-paper/45 uppercase">
                    <th className="px-1 py-2 text-start font-semibold">{t("Person")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Assigned")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Done")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Late")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Overdue")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Avg time")}</th>
                    <th className="px-1 py-2 font-semibold">{t("Completion")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {r.people.map((p) => {
                    const dept = i.deptById.get(i.userById.get(p.user_id)?.department_id ?? "");
                    return (
                      <tr key={p.user_id}>
                        <td className="px-1 py-2">
                          <span className="font-semibold">{p.name}</span>
                          <span className="block text-xs text-paper/45">
                            {t(p.title)}
                            {dept ? ` · ${t(dept.name)}` : ""}
                          </span>
                        </td>
                        <td className="tnum px-1 py-2 text-end">{p.assigned}</td>
                        <td className="tnum px-1 py-2 text-end text-brand">{p.completed}</td>
                        <td className="tnum px-1 py-2 text-end text-warn">{p.delayed}</td>
                        <td className={cn("tnum px-1 py-2 text-end", p.overdue > 0 && "text-crit")}>{p.overdue}</td>
                        <td className="tnum px-1 py-2 text-end text-paper/70">{p.completed ? fmtDuration(p.avg_seconds) : "–"}</td>
                        <td className="px-1 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, p.completion_rate)}%` }} />
                            </div>
                            <span className="tnum w-10 text-end text-xs">{Math.round(p.completion_rate)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t("Events")} icon={<PartyPopper className="size-5" />}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Mini label={t("Held")} value={r.events.count} />
            <Mini label={t("Guests")} value={r.events.guests} />
            <Mini label={t("Prep tasks on time")} value={r.events.tasks ? `${r.events.tasks_on_time}/${r.events.tasks}` : "–"} />
          </div>
          {money && (
            <p className="mb-3 text-sm text-paper/65">
              {t("Packages {total} · deposits received {dep}", { total: fmtMoney(r.events.revenue), dep: fmtMoney(r.events.deposits) })}
              {r.events.cancelled > 0 && ` · ${t("{n} cancelled", { n: r.events.cancelled })}`}
            </p>
          )}
          {r.events.list.length === 0 ? (
            <Empty title={t("No events in this range")} />
          ) : (
            <ul className="max-h-[360px] space-y-1.5 overflow-y-auto">
              {r.events.list.map((e) => (
                <li key={e.id} className={cn("flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-2", e.status === "cancelled" && "opacity-45")}>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: EVENT_KIND_COLOR[e.kind] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.title}</span>
                    <span className="tnum block text-xs text-paper/50">
                      {fmtDay(e.starts_at)} {fmtTime(e.starts_at)} · {fmtParty(e.kids, e.adults)} · {t(EVENT_STATUS_LABEL[e.status])}
                    </span>
                  </span>
                  {money && <span className="tnum text-sm">{fmtMoney(e.package_price)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("Walk-ins")} icon={<DoorOpen className="size-5" />}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Mini label={t("People")} value={r.walkins.people} />
            <Mini label={t("Busiest day")} value={r.walkins.busiest_day ? fmtKeyShort(r.walkins.busiest_day.date) : "–"} />
            <Mini label={t("Busiest hour")} value={r.walkins.busiest_hour !== null ? `${String(r.walkins.busiest_hour).padStart(2, "0")}:00` : "–"} />
          </div>
          {r.days <= 62 && (
            <div className="flex h-32 items-end gap-0.5" dir="ltr">
              {r.walkins.per_day.map((d) => (
                <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${fmtKey(d.date)}: ${d.people}`}>
                  <div className="w-full rounded-t bg-brand/70" style={{ height: `${(d.people / maxDay) * 100}%`, minHeight: d.people ? 3 : 1, opacity: d.people ? 1 : 0.2 }} />
                </div>
              ))}
            </div>
          )}
          {r.walkins.per_area.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {r.walkins.per_area.map((a) => (
                <li key={a.area} className="flex justify-between gap-2">
                  <span className="text-paper/70">{t(AREA_LABEL[a.area])}</span>
                  <span className="tnum">
                    {a.people}
                    {money && <span className="text-paper/45"> · {fmtMoney(a.amount)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {money && (
          <Panel title={t("Revenue")} icon={<Wallet className="size-5" />} className="xl:col-span-2">
            <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
              <Mini label={t("Door")} value={fmtMoney(r.revenue.door)} />
              <Mini label={t("Events")} value={fmtMoney(r.revenue.events)} />
              <Mini label={t("Restaurant")} value={fmtMoney(r.revenue.restaurant)} />
              <Mini label={t("Other")} value={fmtMoney(r.revenue.other)} />
              <Mini label={t("Total")} value={fmtMoney(r.revenue.total)} strong />
            </div>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-[11px] tracking-wider text-paper/45 uppercase">
                    <th className="px-1 py-2 text-start font-semibold">{t("Date")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Door")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Events")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Restaurant")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Other")}</th>
                    <th className="px-1 py-2 text-end font-semibold">{t("Total")}</th>
                  </tr>
                </thead>
                <tbody className="tnum divide-y divide-white/6">
                  {[...r.revenue.per_day].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className="px-1 py-1.5">{fmtKey(d.date)}</td>
                      <td className="px-1 py-1.5 text-end">{fmtMoney(d.door)}</td>
                      <td className="px-1 py-1.5 text-end">{fmtMoney(d.events)}</td>
                      <td className={cn("px-1 py-1.5 text-end", d.restaurant === 0 && d.date < today && "text-warn")}>{d.restaurant === 0 && d.date < today ? t("not entered") : fmtMoney(d.restaurant)}</td>
                      <td className="px-1 py-1.5 text-end">{fmtMoney(d.other)}</td>
                      <td className="px-1 py-1.5 text-end font-semibold">{fmtMoney(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-paper/45">{t("Door money comes from logged walk-ins, events from package prices, restaurant and other income from what managers type in on the Walk-ins screen.")}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
      <p className="text-[10px] font-semibold tracking-wider text-paper/45 uppercase">{label}</p>
      <p className={cn("tnum mt-0.5 font-display text-xl font-bold", strong && "text-brand")}>{value}</p>
    </div>
  );
}
