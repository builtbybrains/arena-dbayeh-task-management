"use client";

import { Baby, ChevronLeft, ChevronRight, DoorOpen, DollarSign, Settings2, Trash2, User as UserIcon, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, Money } from "@/components/forms";
import { Btn, Empty, PageHeader, Panel, Stat } from "@/components/kit";
import { t } from "@/lib/i18n";
import { canEditWalkIn, canEnterRevenue, canSeeRevenue } from "@/lib/permissions";
import { idx } from "@/lib/selectors";
import { actions, useDb, useMe, useNow } from "@/lib/store";
import { addDays, beirutHour, dateKey, fmtKeyLong, fmtTime, ms } from "@/lib/time";
import { AREA_LABEL } from "@/lib/types";
import { useUi } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { eventsOnDay, fmtMoney, fmtParty, people, walkInsInRange, walkInTotals } from "@/lib/venue";

const HOURS = Array.from({ length: 15 }, (_, n) => n + 9); // 09:00 – 23:00

export default function WalkInsPage() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const [day, setDay] = useState(today);
  const list = useMemo(() => walkInsInRange(db, day, day), [db, day]);
  const totals = walkInTotals(list);
  const usual = useMemo(() => {
    const prev = [1, 2, 3, 4].map((w) => walkInTotals(walkInsInRange(db, addDays(day, -7 * w), addDays(day, -7 * w))).people).filter((n) => n > 0);
    return prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : null;
  }, [db, day]);
  const byHour = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of list) m.set(beirutHour(ms(w.at)), (m.get(beirutHour(ms(w.at))) ?? 0) + people(w));
    return m;
  }, [list]);
  const peak = Math.max(1, ...byHour.values());
  const i = idx(db);
  const money = canSeeRevenue(me) || me.role === "manager";

  return (
    <>
      <PageHeader eyebrow={t("Walk-ins")} title={t("Who came in today")} sub={t("Everyone on shift can log walk-ins. Counts feed the busy forecast and the reports.")}>
        <Btn variant="primary" size="lg" onClick={() => useUi.setState({ walkIn: true })}>
          <DoorOpen className="size-5" /> {t("Log a walk-in")}
        </Btn>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="subtle" onClick={() => setDay(addDays(day, -1))} aria-label={t("Previous day")}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Btn>
        <input type="date" className="field h-9 w-auto py-0" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("Date")} />
        <Btn size="sm" variant="subtle" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label={t("Next day")}>
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Btn>
        {day !== today && (
          <Btn size="sm" onClick={() => setDay(today)}>
            {t("Today")}
          </Btn>
        )}
        <p className="ms-auto text-sm font-semibold text-paper/70">{fmtKeyLong(day)}</p>
      </div>

      <div className={cn("mb-4 grid gap-3", money ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3")}>
        <Stat label={t("People")} value={totals.people} icon={<Users className="size-4" />} tone="brand" sub={usual !== null ? t("Usually {n} on this weekday", { n: usual }) : undefined} />
        <Stat label={t("Kids")} value={totals.kids} icon={<Baby className="size-4" />} />
        <Stat label={t("Adults")} value={totals.adults} icon={<UserIcon className="size-4" />} />
        {money && <Stat label={t("Paid at the door")} value={totals.amount} format={(n) => fmtMoney(n)} icon={<DollarSign className="size-4" />} />}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title={t("By hour")}>
            <div className="flex h-36 items-end gap-1" dir="ltr">
              {HOURS.map((h) => {
                const v = byHour.get(h) ?? 0;
                return (
                  <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    {v > 0 && <span className="tnum text-[10px] text-paper/60">{v}</span>}
                    <div className="w-full rounded-t-md bg-brand/70" style={{ height: `${(v / peak) * 100}%`, minHeight: v ? 4 : 1, opacity: v ? 1 : 0.15 }} />
                    <span className="tnum text-[9px] text-paper/40">{h}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title={t("Log")}>
            {list.length === 0 ? (
              <Empty icon={<DoorOpen className="size-6" />} title={t("No walk-ins logged")} hint={day === today ? t("Tap “Walk-in” at the top whenever a family arrives.") : undefined} />
            ) : (
              <ul className="divide-y divide-white/6">
                {list.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2">
                    <span className="tnum w-12 shrink-0 text-sm font-semibold text-paper/80">{fmtTime(w.at)}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{fmtParty(w.kids, w.adults)}</span>
                      <span className="text-paper/50"> · {t(AREA_LABEL[w.area])}</span>
                      <span className="block truncate text-xs text-paper/45">
                        {i.userById.get(w.logged_by)?.name}
                        {w.note && ` · ${w.note}`}
                      </span>
                    </span>
                    {money && <span className="tnum text-sm text-paper/70">{fmtMoney(w.amount)}</span>}
                    {canEditWalkIn(me, w, now) && (
                      <Btn size="sm" variant="subtle" onClick={() => actions.removeWalkIn(w.id)} aria-label={t("Remove")}>
                        <Trash2 className="size-4" />
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          {canEnterRevenue(me) && <RevenuePanel day={day} doorTotal={totals.amount} />}
          {(me.role === "owner" || me.role === "ops") && <PricesPanel />}
        </div>
      </div>
    </>
  );
}

function RevenuePanel({ day, doorTotal }: { day: string; doorTotal: number }) {
  const db = useDb();
  const me = useMe();
  const find = (source: "restaurant" | "other") => db.revenue.find((r) => r.id === `${day}_${source}`);
  const [rest, setRest] = useState(find("restaurant")?.amount ?? 0);
  const [other, setOther] = useState(find("other")?.amount ?? 0);
  const [note, setNote] = useState(find("other")?.note ?? "");
  const [shownDay, setShownDay] = useState(day);
  if (shownDay !== day) {
    // Day changed: load that day's figures.
    setShownDay(day);
    setRest(find("restaurant")?.amount ?? 0);
    setOther(find("other")?.amount ?? 0);
    setNote(find("other")?.note ?? "");
  }
  const events = eventsOnDay(db, day).reduce((n, e) => n + e.package_price, 0);
  const seeAll = canSeeRevenue(me);
  const save = () => {
    actions.setRevenue(day, "restaurant", rest);
    if (seeAll || other) actions.setRevenue(day, "other", other, note);
  };
  return (
    <Panel title={t("Revenue for the day")} icon={<DollarSign className="size-5" />}>
      <div className="space-y-3">
        <Field label={t("Restaurant sales")}>
          <Money value={rest} onChange={setRest} label={t("Restaurant sales")} />
        </Field>
        {seeAll && (
          <div className="grid grid-cols-[1fr_1.3fr] gap-2">
            <Field label={t("Other income")}>
              <Money value={other} onChange={setOther} label={t("Other income")} />
            </Field>
            <Field label={t("What for")}>
              <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
        <Btn variant="primary" className="w-full" onClick={save}>
          {t("Save revenue")}
        </Btn>
        {seeAll && (
          <dl className="grid grid-cols-2 gap-2 border-t border-white/8 pt-3 text-sm">
            <dt className="text-paper/55">{t("Door (walk-ins)")}</dt>
            <dd className="tnum text-end font-semibold">{fmtMoney(doorTotal)}</dd>
            <dt className="text-paper/55">{t("Event packages")}</dt>
            <dd className="tnum text-end font-semibold">{fmtMoney(events)}</dd>
            <dt className="text-paper/55">{t("Restaurant")}</dt>
            <dd className="tnum text-end font-semibold">{fmtMoney(find("restaurant")?.amount ?? 0)}</dd>
            <dt className="text-paper/55">{t("Other")}</dt>
            <dd className="tnum text-end font-semibold">{fmtMoney(find("other")?.amount ?? 0)}</dd>
            <dt className="font-semibold">{t("Total")}</dt>
            <dd className="tnum text-end font-display text-xl font-bold text-brand">
              {fmtMoney(doorTotal + events + (find("restaurant")?.amount ?? 0) + (find("other")?.amount ?? 0))}
            </dd>
          </dl>
        )}
      </div>
    </Panel>
  );
}

function PricesPanel() {
  const db = useDb();
  const ws = db.workspace;
  const [kid, setKid] = useState(ws?.walkin_price_kid ?? 0);
  const [adult, setAdult] = useState(ws?.walkin_price_adult ?? 0);
  if (!ws) return null;
  return (
    <Panel title={t("Entry prices")} icon={<Settings2 className="size-5" />}>
      <p className="mb-3 text-xs text-paper/55">{t("Used to fill in the amount when a playground walk-in is logged. Staff can still change it.")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Per kid")}>
          <Money value={kid} onChange={setKid} label={t("Per kid")} />
        </Field>
        <Field label={t("Per adult")}>
          <Money value={adult} onChange={setAdult} label={t("Per adult")} />
        </Field>
      </div>
      <Btn className="mt-3 w-full" onClick={() => actions.updateWorkspace({ walkin_price_kid: kid, walkin_price_adult: adult })}>
        {t("Save prices")}
      </Btn>
    </Panel>
  );
}
