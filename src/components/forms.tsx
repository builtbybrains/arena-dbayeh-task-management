"use client";

// Small form pieces shared by the venue screens (events, walk-ins, reminders, people).

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const labelCls = "mb-1.5 block text-[11px] font-semibold tracking-[0.14em] text-paper/50 uppercase";

export function Field({ label, htmlFor, children, hint, className }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-paper/45">{hint}</p>}
    </div>
  );
}

/** Big +/- counter that works with a thumb. */
export function Stepper({ value, onChange, label, min = 0, max = 500, big }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number; big?: boolean }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n) || 0)));
  const btn = cn("glass grid shrink-0 place-items-center rounded-full transition active:scale-90", big ? "size-14" : "size-10");
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => set(value - 1)} aria-label={t("Fewer {what}", { what: label })} disabled={value <= min}>
        <Minus className={big ? "size-6" : "size-4"} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={cn("field tnum text-center font-display font-bold", big ? "h-14 w-20 text-3xl" : "h-10 w-16 text-xl")}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => set(Number(e.target.value))}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className={btn} onClick={() => set(value + 1)} aria-label={t("More {what}", { what: label })} disabled={value >= max}>
        <Plus className={big ? "size-6" : "size-4"} />
      </button>
    </div>
  );
}

export function Money({ value, onChange, label, id }: { value: number; onChange: (n: number) => void; label: string; id?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-paper/45">$</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        className="field tnum ps-7"
        aria-label={label}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}
