"use client";

// Money Mondo money: pickups by money collectors, each counter's daily cash,
// OMT transfers per operator, expenses, and a summary for any dates.

import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, Download, HandCoins, Landmark, Receipt, Trash2, Truck, Wallet } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Field } from "@/components/forms";
import { Btn, Chip, Empty, PageHeader, Panel, Segmented, Stat } from "@/components/kit";
import { downloadCsv, rangeSlug, type CsvRows } from "@/lib/export";
import { t } from "@/lib/i18n";
import {
  awaitingMe,
  COUNTER_LABEL,
  COUNTERS,
  cashFor,
  expensesFor,
  fmtAmount,
  fmtPair,
  moneySummary,
  notSettled,
  pickupsFor,
  transfersFor,
  type Pair,
} from "@/lib/money";
import {
  canEditExpense,
  canEditPickup,
  canEnterTransfersFor,
  canLogPickup,
  canSeeAllMoney,
  canSeeOmtMoney,
  canSeeTransfers,
  cashCounters,
} from "@/lib/permissions";
import { idx } from "@/lib/selectors";
import { actions, useDb, useMe, useNow } from "@/lib/store";
import { addDays, dateKey, fmtKeyLong, fmtKeyShort, fmtTime, fromInputs, iso, timeInputValue } from "@/lib/time";
import type { Currency, Database, MmCounter, MmPickup, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "pickups" | "cash" | "transfers" | "expenses" | "summary";

export default function MoneyPage() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const [day, setDay] = useState(today);

  const waiting = useMemo(() => awaitingMe(db, me), [db, me]);
  const tabs = useMemo(() => {
    const out: { value: Tab; label: string }[] = [];
    if (canLogPickup(me) || db.mm_pickups.some((p) => p.handed_to === me.id || p.collector_id === me.id)) out.push({ value: "pickups", label: t("Pickups") });
    if (cashCounters(me).length) out.push({ value: "cash", label: t("Daily cash") });
    if (canSeeTransfers(me)) out.push({ value: "transfers", label: t("OMT transfers") });
    out.push({ value: "expenses", label: t("Expenses") });
    if (canSeeOmtMoney(me)) out.unshift({ value: "summary", label: t("Summary") });
    return out;
  }, [db.mm_pickups, me]);
  const [tab, setTab] = useState<Tab>(() => (waiting.length ? "pickups" : tabs[0].value));
  const current = tabs.some((x) => x.value === tab) ? tab : tabs[0].value;

  return (
    <>
      <PageHeader
        eyebrow={t("Money Mondo")}
        title={t("Money")}
        sub={
          canSeeAllMoney(me)
            ? t("Pickups, each counter's cash, OMT transfers and expenses. Dollars and lira are kept apart.")
            : t("Enter the money you handle. You see your own entries.")
        }
      />
      {waiting.length > 0 && <AwaitingPanel db={db} list={waiting} />}
      <Segmented id="money-tab" className="no-print mb-4" value={current} onChange={setTab} options={tabs} />
      {current !== "summary" && <DayPicker day={day} setDay={setDay} today={today} />}
      {current === "summary" && <SummaryTab />}
      {current === "pickups" && <PickupsTab day={day} />}
      {current === "cash" && <CashTab day={day} />}
      {current === "transfers" && <TransfersTab day={day} />}
      {current === "expenses" && <ExpensesTab day={day} />}
    </>
  );
}

function DayPicker({ day, setDay, today }: { day: string; setDay: (d: string) => void; today: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
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
      <p className="text-sm font-semibold text-paper/70">{fmtKeyLong(day)}</p>
    </div>
  );
}

function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="glass inline-flex rounded-full p-1" role="group" aria-label={t("Currency")}>
      {(["USD", "LBP"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn("rounded-full px-3 py-1 text-sm font-bold", value === c ? "bg-brand text-ink" : "text-paper/65")}
        >
          {c === "USD" ? "$ USD" : "LBP"}
        </button>
      ))}
    </div>
  );
}

function AmountInput({ id, value, onChange, currency, label }: { id: string; value: string; onChange: (v: string) => void; currency: Currency; label: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-paper/45">{currency === "USD" ? "$" : "LBP"}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        className={cn("field tnum", currency === "USD" ? "ps-7" : "ps-12")}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}

const num = (v: string) => Math.max(0, Number(v) || 0);

// --- Hand-overs waiting for me -----------------------------------------------------------

function AwaitingPanel({ db, list }: { db: Database; list: MmPickup[] }) {
  const i = idx(db);
  return (
    <div className="mb-5 rounded-3xl border border-med/40 bg-med/8 p-4">
      <p className="flex items-center gap-2 font-display text-lg font-bold tracking-wide uppercase">
        <HandCoins className="size-5 text-med" /> {t("Money handed to you")}
      </p>
      <p className="mt-0.5 text-sm text-paper/60">{t("Confirm once you have counted it. The collector sees it is settled.")}</p>
      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-ink/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="tnum font-display text-2xl font-bold">{fmtAmount(p.amount, p.currency)}</p>
              <p className="text-xs text-paper/60">
                {i.userById.get(p.collector_id)?.name ?? ""} · {p.source} · {fmtKeyShort(dateKey(p.at))} {fmtTime(p.at)}
              </p>
            </div>
            <Btn variant="primary" onClick={() => actions.confirmPickup(p.id)}>
              <Check className="size-4" /> {t("I received it")}
            </Btn>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Pickups --------------------------------------------------------------------------------

function PickupsTab({ day }: { day: string }) {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const i = idx(db);
  const list = useMemo(() => pickupsFor(db, me, day, day), [db, me, day]);
  const open = useMemo(() => notSettled(db, me), [db, me]);
  const totals = (rows: MmPickup[]) => rows.reduce<Pair>((acc, p) => ({ ...acc, [p.currency]: acc[p.currency] + p.amount }), { USD: 0, LBP: 0 });
  const collectors = db.users.filter((u) => u.active_status && u.mm_jobs?.includes("collector"));
  const receivers = db.users.filter((u) => u.active_status).sort((a, b) => (a.role === "owner" ? 1 : 0) - (b.role === "owner" ? 1 : 0) || a.name.localeCompare(b.name));
  const mall = db.users.find((u) => u.active_status && u.role === "ops");
  const [handing, setHanding] = useState<string | null>(null);
  const [handTo, setHandTo] = useState(mall?.id ?? "");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {canLogPickup(me) ? <PickupForm day={day} collectors={collectors} now={now} /> : <div className="hidden lg:block" />}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("Collected this day")} text={fmtPair(totals(list))} icon={<Truck className="size-4" />} />
          <Stat
            label={t("Not settled yet")}
            text={fmtPair(totals(open))}
            sub={t("{n} pickups, any day", { n: open.length })}
            tone={open.length ? "warn" : "default"}
            icon={<HandCoins className="size-4" />}
          />
        </div>
        <Panel title={t("Pickups")} icon={<Truck className="size-5" />}>
          {list.length === 0 ? (
            <Empty title={t("No pickups this day")} />
          ) : (
            <ul className="space-y-2">
              {list.map((p) => {
                const to = p.handed_to ? i.userById.get(p.handed_to) : undefined;
                return (
                  <li key={p.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="tnum font-display text-xl font-bold">{fmtAmount(p.amount, p.currency)}</p>
                        <p className="text-xs text-paper/60">
                          {fmtTime(p.at)} · {p.source} · {i.userById.get(p.collector_id)?.name ?? ""}
                        </p>
                        {p.note && <p className="mt-1 text-xs text-paper/50">{p.note}</p>}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold",
                          p.confirmed_at ? "bg-brand/15 text-brand" : p.handed_to ? "bg-med/15 text-med" : "bg-warn/15 text-warn",
                        )}
                      >
                        {p.confirmed_at
                          ? t("Received by {name}", { name: to?.name ?? "" })
                          : p.handed_to
                            ? t("Handed to {name}, not confirmed", { name: to?.name ?? "" })
                            : t("With the collector")}
                      </span>
                    </div>
                    {canEditPickup(me, p) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {handing === p.id ? (
                          <>
                            <select className="field h-9 w-auto min-w-40 py-0" value={handTo} onChange={(e) => setHandTo(e.target.value)} aria-label={t("Handed to")}>
                              <option value="">{t("Handed to…")}</option>
                              {receivers
                                .filter((u) => u.id !== p.collector_id)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} · {t(u.title)}
                                  </option>
                                ))}
                            </select>
                            <Btn
                              size="sm"
                              variant="primary"
                              disabled={!handTo}
                              onClick={() => {
                                if (actions.handOverPickup(p.id, handTo)) setHanding(null);
                              }}
                            >
                              {t("Save")}
                            </Btn>
                            <Btn size="sm" variant="subtle" onClick={() => setHanding(null)}>
                              {t("Cancel")}
                            </Btn>
                          </>
                        ) : (
                          <>
                            <Btn size="sm" onClick={() => setHanding(p.id)}>
                              <ArrowRightLeft className="size-3.5" /> {p.handed_to ? t("Handed to someone else") : t("Hand over")}
                            </Btn>
                            <Btn size="sm" variant="subtle" onClick={() => actions.removePickup(p.id)} aria-label={t("Remove")}>
                              <Trash2 className="size-3.5" />
                            </Btn>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function PickupForm({ day, collectors, now }: { day: string; collectors: User[]; now: number }) {
  const me = useMe();
  const self = collectors.some((u) => u.id === me.id);
  const [collector, setCollector] = useState(self ? me.id : (collectors[0]?.id ?? ""));
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState(() => timeInputValue(now));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const at = day === dateKey(now) && !time ? iso(now) : fromInputs(day, time || "12:00");
    if (actions.logPickup({ collector_id: collector, amount: num(amount), currency, source, note, at })) {
      setAmount("");
      setSource("");
      setNote("");
    }
  };
  return (
    <Panel title={t("Log a pickup")} icon={<Truck className="size-5" />}>
      <form onSubmit={submit} className="space-y-3">
        {(!self || canSeeAllMoney(me)) && (
          <Field label={t("Money collector")} htmlFor="pk-coll">
            <select id="pk-coll" className="field" value={collector} onChange={(e) => setCollector(e.target.value)}>
              {collectors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {collectors.length === 0 && <p className="text-xs text-warn">{t("Add a Money Collector first (Team → People and PINs).")}</p>}
        <Field label={t("Amount")} htmlFor="pk-amount">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <AmountInput id="pk-amount" value={amount} onChange={setAmount} currency={currency} label={t("Amount")} />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
        </Field>
        <Field label={t("Collected from")} htmlFor="pk-src">
          <input id="pk-src" className="field" value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("e.g. Jounieh agent")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Time")} htmlFor="pk-time">
            <input id="pk-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label={t("Note (optional)")} htmlFor="pk-note">
            <input id="pk-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <Btn variant="primary" type="submit" className="w-full" disabled={!collector || num(amount) <= 0 || source.trim().length < 2}>
          {t("Save pickup")}
        </Btn>
      </form>
    </Panel>
  );
}

// --- Daily cash per counter -------------------------------------------------------------------

function CashTab({ day }: { day: string }) {
  const db = useDb();
  const me = useMe();
  const counters = cashCounters(me);
  const rows = cashFor(db, me, addDays(day, -6), day);
  const i = idx(db);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {counters.map((c) => (
          <CashCard key={`${day}_${c}`} day={day} counter={c} />
        ))}
      </div>
      <Panel title={t("Last 7 days")} icon={<Landmark className="size-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-start text-[11px] tracking-wider text-paper/45 uppercase">
                <th className="py-2 text-start font-semibold">{t("Date")}</th>
                {counters.map((c) => (
                  <th key={c} className="py-2 text-end font-semibold">
                    {t(COUNTER_LABEL[c])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, n) => addDays(day, -n)).map((d) => (
                <tr key={d} className="border-t border-white/6">
                  <td className="py-2 text-paper/70">{fmtKeyShort(d)}</td>
                  {counters.map((c) => {
                    const r = rows.find((x) => x.date === d && x.counter === c);
                    return (
                      <td key={c} className="tnum py-2 text-end" title={r ? t("Entered by {name}", { name: i.userById.get(r.entered_by)?.name ?? "" }) : undefined}>
                        {r ? fmtPair({ USD: r.usd, LBP: r.lbp }) : <span className="text-paper/30">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function CashCard({ day, counter }: { day: string; counter: MmCounter }) {
  const db = useDb();
  const row = db.mm_cash.find((r) => r.id === `${day}_${counter}`);
  const i = idx(db);
  const [usd, setUsd] = useState(row ? String(row.usd) : "");
  const [lbp, setLbp] = useState(row ? String(row.lbp) : "");
  const [note, setNote] = useState(row?.note ?? "");
  return (
    <Panel title={t("{counter} counter", { counter: t(COUNTER_LABEL[counter]) })} icon={<Wallet className="size-5" />}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          actions.setCash(day, counter, num(usd), num(lbp), note);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Dollars")} htmlFor={`c-usd-${counter}`}>
            <AmountInput id={`c-usd-${counter}`} value={usd} onChange={setUsd} currency="USD" label={t("Dollars")} />
          </Field>
          <Field label={t("Lira")} htmlFor={`c-lbp-${counter}`}>
            <AmountInput id={`c-lbp-${counter}`} value={lbp} onChange={setLbp} currency="LBP" label={t("Lira")} />
          </Field>
        </div>
        <Field label={t("Note (optional)")} htmlFor={`c-note-${counter}`}>
          <input id={`c-note-${counter}`} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-paper/45">
            {row ? t("Entered by {name} at {time}", { name: i.userById.get(row.entered_by)?.name ?? "", time: fmtTime(row.updated_at) }) : t("Not entered yet")}
          </p>
          <Btn variant="primary" type="submit" size="sm">
            {row ? t("Update") : t("Save")}
          </Btn>
        </div>
      </form>
    </Panel>
  );
}

// --- OMT transfers -------------------------------------------------------------------------------

function TransfersTab({ day }: { day: string }) {
  const db = useDb();
  const me = useMe();
  const operators = db.users.filter((u) => u.active_status && u.mm_jobs?.includes("omt") && canEnterTransfersFor(me, u));
  const rows = useMemo(() => transfersFor(db, me, day, day), [db, me, day]);
  const [editing, setEditing] = useState<string | null>(operators.length === 1 ? operators[0].id : null);
  const sum = rows.reduce(
    (a, r) => ({ sent: a.sent + r.sent_count, received: a.received + r.received_count }),
    { sent: 0, received: 0 },
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <Stat label={t("Sent")} value={sum.sent} icon={<ArrowRightLeft className="size-4" />} />
        <Stat label={t("Received")} value={sum.received} icon={<ArrowRightLeft className="size-4" />} />
      </div>
      {operators.length === 0 ? (
        <Empty title={t("No OMT Operators yet")} hint={t("Give someone the OMT Operator job under Team → People and PINs.")} />
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {operators.map((op) => {
            const r = rows.find((x) => x.operator_id === op.id);
            return (
              <Panel key={op.id} title={op.name} right={!editing || editing !== op.id ? <Btn size="sm" onClick={() => setEditing(op.id)}>{r ? t("Edit") : t("Enter")}</Btn> : undefined}>
                {editing === op.id ? (
                  <TransfersForm key={`${day}_${op.id}`} day={day} operatorId={op.id} onDone={() => setEditing(operators.length === 1 ? op.id : null)} />
                ) : r ? (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] tracking-wider text-paper/45 uppercase">{t("Sent")}</dt>
                      <dd className="tnum font-semibold">
                        {r.sent_count} · {fmtPair({ USD: r.sent_usd, LBP: r.sent_lbp })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] tracking-wider text-paper/45 uppercase">{t("Received")}</dt>
                      <dd className="tnum font-semibold">
                        {r.received_count} · {fmtPair({ USD: r.received_usd, LBP: r.received_lbp })}
                      </dd>
                    </div>
                    {r.note && <p className="col-span-2 text-xs text-paper/50">{r.note}</p>}
                  </dl>
                ) : (
                  <p className="text-sm text-paper/45">{t("Not entered yet")}</p>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransfersForm({ day, operatorId, onDone }: { day: string; operatorId: string; onDone: () => void }) {
  const db = useDb();
  const r = db.mm_transfers.find((x) => x.id === `${day}_${operatorId}`);
  const [f, setF] = useState(() => ({
    sent_count: String(r?.sent_count ?? ""),
    sent_usd: String(r?.sent_usd ?? ""),
    sent_lbp: String(r?.sent_lbp ?? ""),
    received_count: String(r?.received_count ?? ""),
    received_usd: String(r?.received_usd ?? ""),
    received_lbp: String(r?.received_lbp ?? ""),
    note: r?.note ?? "",
  }));
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const block = (label: string, prefix: "sent" | "received") => (
    <fieldset className="space-y-2 rounded-2xl border border-white/8 p-3">
      <legend className="px-1 text-[11px] font-semibold tracking-[0.14em] text-paper/50 uppercase">{label}</legend>
      <Field label={t("How many")} htmlFor={`${prefix}-n-${operatorId}`}>
        <input
          id={`${prefix}-n-${operatorId}`}
          type="number"
          inputMode="numeric"
          min={0}
          className="field tnum"
          value={f[`${prefix}_count`]}
          onChange={(e) => set(`${prefix}_count`)(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <AmountInput id={`${prefix}-usd-${operatorId}`} value={f[`${prefix}_usd`]} onChange={set(`${prefix}_usd`)} currency="USD" label={`${label} · ${t("Dollars")}`} />
        <AmountInput id={`${prefix}-lbp-${operatorId}`} value={f[`${prefix}_lbp`]} onChange={set(`${prefix}_lbp`)} currency="LBP" label={`${label} · ${t("Lira")}`} />
      </div>
    </fieldset>
  );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = actions.setTransfers({
          date: day,
          operator_id: operatorId,
          sent_count: num(f.sent_count),
          sent_usd: num(f.sent_usd),
          sent_lbp: num(f.sent_lbp),
          received_count: num(f.received_count),
          received_usd: num(f.received_usd),
          received_lbp: num(f.received_lbp),
          note: f.note,
        });
        if (ok) onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {block(t("Sent"), "sent")}
        {block(t("Received"), "received")}
      </div>
      <Field label={t("Note (optional)")} htmlFor={`tr-note-${operatorId}`}>
        <input id={`tr-note-${operatorId}`} className="field" value={f.note} onChange={(e) => set("note")(e.target.value)} />
      </Field>
      <Btn variant="primary" type="submit" className="w-full">
        {r ? t("Update") : t("Save")}
      </Btn>
    </form>
  );
}

// --- Expenses -------------------------------------------------------------------------------------

const EXPENSE_CATEGORIES = ["Stationery", "Cleaning", "Fuel for collection", "Snacks for staff", "Repairs", "Internet and phone"];

function ExpensesTab({ day }: { day: string }) {
  const db = useDb();
  const me = useMe();
  const i = idx(db);
  const list = useMemo(() => expensesFor(db, me, day, day), [db, me, day]);
  const counters = cashCounters(me);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [counter, setCounter] = useState<MmCounter | "">("");
  const total = list.reduce<Pair>((a, e) => ({ ...a, [e.currency]: a[e.currency] + e.amount }), { USD: 0, LBP: 0 });
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel title={t("Log an expense")} icon={<Receipt className="size-5" />}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (actions.logExpense({ date: day, amount: num(amount), currency, category, note, counter: counter || null })) {
              setAmount("");
              setNote("");
            }
          }}
        >
          <Field label={t("Amount")} htmlFor="ex-amount">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <AmountInput id="ex-amount" value={amount} onChange={setAmount} currency={currency} label={t("Amount")} />
              </div>
              <CurrencyToggle value={currency} onChange={setCurrency} />
            </div>
          </Field>
          <Field label={t("What for")} htmlFor="ex-cat">
            <input id="ex-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)} list="ex-cats" />
            <datalist id="ex-cats">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={t(c)} />
              ))}
            </datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.slice(0, 4).map((c) => (
                <Chip key={c} active={category === t(c)} onClick={() => setCategory(t(c))}>
                  {t(c)}
                </Chip>
              ))}
            </div>
          </Field>
          {counters.length > 0 && (
            <Field label={t("Paid from counter (optional)")}>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={counter === ""} onClick={() => setCounter("")}>
                  {t("None")}
                </Chip>
                {counters.map((c) => (
                  <Chip key={c} active={counter === c} onClick={() => setCounter(c)}>
                    {t(COUNTER_LABEL[c])}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          <Field label={t("Note (optional)")} htmlFor="ex-note">
            <input id="ex-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Btn variant="primary" type="submit" className="w-full" disabled={num(amount) <= 0 || category.trim().length < 2}>
            {t("Save expense")}
          </Btn>
        </form>
      </Panel>
      <Panel title={t("Expenses")} icon={<Receipt className="size-5" />} right={<span className="tnum text-sm font-semibold">{fmtPair(total)}</span>}>
        {list.length === 0 ? (
          <Empty title={t("No expenses this day")} />
        ) : (
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <span className="tnum">{fmtAmount(e.amount, e.currency)}</span> · {e.category}
                  </p>
                  <p className="text-xs text-paper/55">
                    {i.userById.get(e.logged_by)?.name ?? ""}
                    {e.counter ? ` · ${t("{counter} counter", { counter: t(COUNTER_LABEL[e.counter]) })}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                {canEditExpense(me, e) && (
                  <Btn size="sm" variant="subtle" onClick={() => actions.removeExpense(e.id)} aria-label={t("Remove")}>
                    <Trash2 className="size-3.5" />
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --- Summary -----------------------------------------------------------------------------------------

type Preset = "today" | "yesterday" | "7d" | "month" | "last_month" | "custom";

function range(p: Preset, today: string, custom: { from: string; to: string }) {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (p === "7d") return { from: addDays(today, -6), to: today };
  if (p === "month") return { from: monthStart, to: today };
  if (p === "last_month") {
    const end = addDays(monthStart, -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return custom;
}

function SummaryTab() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const today = dateKey(now);
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState({ from: addDays(today, -6), to: today });
  const { from, to } = range(preset, today, custom);
  const s = useMemo(() => moneySummary(db, me, from, to), [db, me, from, to]);
  const i = idx(db);
  const counters = cashCounters(me);
  const all = canSeeAllMoney(me);

  const exportCsv = () => {
    const rows: CsvRows = [["Money Mondo", `${from} → ${to}`], [], ["Daily cash", "USD", "LBP"]];
    for (const c of counters) rows.push([COUNTER_LABEL[c], s.cash[c].USD, s.cash[c].LBP]);
    rows.push(["Total", s.cashTotal.USD, s.cashTotal.LBP], [], ["OMT transfers", "Sent", "Sent USD", "Sent LBP", "Received", "Received USD", "Received LBP"]);
    for (const o of s.transfers.byOperator)
      rows.push([i.userById.get(o.operator_id)?.name ?? "", o.sent_count, o.sent.USD, o.sent.LBP, o.received_count, o.received.USD, o.received.LBP]);
    if (s.pickups) rows.push([], ["Pickups", "USD", "LBP"], ["Collected", s.pickups.collected.USD, s.pickups.collected.LBP], ["Confirmed", s.pickups.confirmed.USD, s.pickups.confirmed.LBP], ["Not settled", s.pickups.pending.USD, s.pickups.pending.LBP]);
    rows.push([], ["Expenses", "USD", "LBP"]);
    for (const c of s.expenses.byCategory) rows.push([c.category, c.total.USD, c.total.LBP]);
    rows.push(["Total", s.expenses.total.USD, s.expenses.total.LBP]);
    downloadCsv(`money-mondo-${rangeSlug(from, to)}`, rows);
  };

  const presets: [Preset, string][] = [
    ["today", t("Today")],
    ["yesterday", t("Yesterday")],
    ["7d", t("Last 7 days")],
    ["month", t("This month")],
    ["last_month", t("Last month")],
    ["custom", t("Pick dates")],
  ];

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-1.5">
        {presets.map(([p, label]) => (
          <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>
            {label}
          </Chip>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" className="field h-9 w-auto py-0" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label={t("From")} />
            <span className="text-paper/40">→</span>
            <input type="date" className="field h-9 w-auto py-0" value={custom.to} min={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label={t("To")} />
          </span>
        )}
        <Btn size="sm" className="ms-auto" onClick={exportCsv}>
          <Download className="size-4" /> {t("Export CSV")}
        </Btn>
      </div>
      <p className="text-sm text-paper/55">{from === to ? fmtKeyLong(from) : `${fmtKeyShort(from)} → ${fmtKeyShort(to)}`}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Cash at counters")} text={fmtPair(s.cashTotal)} sub={t("{n} days closed", { n: s.cashDays })} icon={<Wallet className="size-4" />} />
        <Stat label={t("OMT transfers")} value={s.transfers.sent_count + s.transfers.received_count} sub={t("{sent} sent · {received} received", { sent: s.transfers.sent_count, received: s.transfers.received_count })} icon={<ArrowRightLeft className="size-4" />} />
        {s.pickups && <Stat label={t("Collected by collectors")} text={fmtPair(s.pickups.collected)} sub={t("{n} pickups", { n: s.pickups.count })} icon={<Truck className="size-4" />} />}
        <Stat label={t("Expenses")} text={fmtPair(s.expenses.total)} icon={<Receipt className="size-4" />} tone={s.expenses.total.USD || s.expenses.total.LBP ? "warn" : "default"} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title={t("Daily cash by counter")} icon={<Landmark className="size-5" />}>
          <Table
            head={[t("Counter"), t("Dollars"), t("Lira")]}
            rows={[
              ...COUNTERS.filter((c) => counters.includes(c)).map((c) => [t(COUNTER_LABEL[c]), fmtAmount(s.cash[c].USD, "USD"), fmtAmount(s.cash[c].LBP, "LBP")]),
              [<strong key="t">{t("Total")}</strong>, <strong key="u">{fmtAmount(s.cashTotal.USD, "USD")}</strong>, <strong key="l">{fmtAmount(s.cashTotal.LBP, "LBP")}</strong>],
            ]}
          />
        </Panel>
        <Panel title={t("OMT transfers by operator")} icon={<ArrowRightLeft className="size-5" />}>
          {s.transfers.byOperator.length === 0 ? (
            <Empty title={t("Nothing entered")} />
          ) : (
            <Table
              head={[t("Operator"), t("Sent"), t("Received")]}
              rows={s.transfers.byOperator.map((o) => [
                i.userById.get(o.operator_id)?.name ?? "",
                <span key="s">
                  <span className="font-semibold">{o.sent_count}</span> <span className="text-paper/50">· {fmtPair(o.sent)}</span>
                </span>,
                <span key="r">
                  <span className="font-semibold">{o.received_count}</span> <span className="text-paper/50">· {fmtPair(o.received)}</span>
                </span>,
              ])}
            />
          )}
        </Panel>
        {all && s.pickups && (
          <Panel title={t("Pickups")} icon={<Truck className="size-5" />}>
            <Table
              head={["", t("Dollars"), t("Lira")]}
              rows={[
                [t("Collected"), fmtAmount(s.pickups.collected.USD, "USD"), fmtAmount(s.pickups.collected.LBP, "LBP")],
                [t("Received and confirmed"), fmtAmount(s.pickups.confirmed.USD, "USD"), fmtAmount(s.pickups.confirmed.LBP, "LBP")],
                [
                  <span key="p" className={cn((s.pickups.pending.USD || s.pickups.pending.LBP) && "text-warn")}>{t("Not settled yet")}</span>,
                  fmtAmount(s.pickups.pending.USD, "USD"),
                  fmtAmount(s.pickups.pending.LBP, "LBP"),
                ],
              ]}
            />
          </Panel>
        )}
        <Panel title={t("Expenses by kind")} icon={<Receipt className="size-5" />}>
          {s.expenses.byCategory.length === 0 ? (
            <Empty title={t("No expenses")} />
          ) : (
            <Table head={[t("What for"), t("Amount")]} rows={s.expenses.byCategory.map((c) => [c.category, fmtPair(c.total)])} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] tracking-wider text-paper/45 uppercase">
            {head.map((h, n) => (
              <th key={n} className={cn("py-2 font-semibold", n === 0 ? "text-start" : "text-end")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => (
            <tr key={n} className="border-t border-white/6">
              {r.map((c, k) => (
                <td key={k} className={cn("tnum py-2", k === 0 ? "text-start text-paper/80" : "text-end")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
