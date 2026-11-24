"use client";

// How a recurring task repeats: every day, chosen weekdays, a day of the
// month, or any dates picked on a calendar. Used when deploying a task and when
// editing a schedule.

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Btn, Chip } from "@/components/kit";
import { t } from "@/lib/i18n";
import { useNow } from "@/lib/store";
import { addDays, dateKey, fmtKey, fmtKeyShort, fmtMonth } from "@/lib/time";
import type { RecurringTask, Repeat } from "@/lib/types";
import { cn } from "@/lib/utils";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, like the calendar

export interface RepeatValue {
  repeat: Repeat;
  weekdays: number[];
  month_day: number;
  dates: string[];
}

export const DEFAULT_REPEAT: RepeatValue = { repeat: "daily", weekdays: [1], month_day: 1, dates: [] };

/** Whether the choice is complete enough to save. */
export const repeatReady = (v: RepeatValue) =>
  (v.repeat !== "weekly" || v.weekdays.length > 0) && (v.repeat !== "custom" || v.dates.length > 0);

/** "Every Mon, Thu at 10:00", "3 chosen dates at 09:00"… */
export function describeRepeat(r: Pick<RecurringTask, "repeat" | "weekdays" | "month_day" | "dates" | "due_time">): string {
  if (r.repeat === "daily") return t("Every day at {time}", { time: r.due_time });
  if (r.repeat === "weekly")
    return t("Every {days} at {time}", { days: [...r.weekdays].sort().map((d) => t(WEEKDAYS[d])).join(t(", ")), time: r.due_time });
  if (r.repeat === "custom") return t("{n} chosen dates at {time}", { n: r.dates?.length ?? 0, time: r.due_time });
  return t("Day {d} of each month at {time}", { d: r.month_day, time: r.due_time });
}

export function RepeatPicker({ value, onChange }: { value: RepeatValue; onChange: (v: RepeatValue) => void }) {
  const set = (change: Partial<RepeatValue>) => onChange({ ...value, ...change });
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {(["daily", "weekly", "monthly", "custom"] as Repeat[]).map((r) => (
          <Chip key={r} active={value.repeat === r} onClick={() => set({ repeat: r })}>
            {t({ daily: "Every day", weekly: "Every week", monthly: "Every month", custom: "Custom dates" }[r])}
          </Chip>
        ))}
      </div>
      {value.repeat === "weekly" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((n) => (
            <Chip
              key={n}
              active={value.weekdays.includes(n)}
              onClick={() => set({ weekdays: value.weekdays.includes(n) ? value.weekdays.filter((x) => x !== n) : [...value.weekdays, n] })}
            >
              {t(WEEKDAYS[n])}
            </Chip>
          ))}
        </div>
      )}
      {value.repeat === "monthly" && (
        <label className="mt-2 flex items-center gap-2 text-sm text-paper/70">
          {t("On day")}
          <input
            type="number"
            min={1}
            max={28}
            className="field w-20 py-1.5 text-center"
            value={value.month_day}
            onChange={(e) => set({ month_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })}
          />
          {t("of each month")}
        </label>
      )}
      {value.repeat === "custom" && <MultiDatePicker value={value.dates} onChange={(dates) => set({ dates })} />}
    </div>
  );
}

/** Tap days to pick any set of dates (today onwards) for a custom schedule. */
export function MultiDatePicker({ value, onChange }: { value: string[]; onChange: (dates: string[]) => void }) {
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
                "tnum grid h-9 place-items-center rounded-xl text-sm",
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
