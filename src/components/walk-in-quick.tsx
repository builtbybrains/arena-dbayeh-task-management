"use client";

// The two-tap walk-in log, opened from the green button in the top bar.

import { Check, DoorOpen } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Stepper } from "@/components/forms";
import { Btn, Chip } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { actions, useDb, useNow } from "@/lib/store";
import { dateKey } from "@/lib/time";
import { AREA_LABEL, type Area } from "@/lib/types";
import { useUi } from "@/lib/ui";
import { liveWalkIns, people } from "@/lib/venue";

const AREAS: Area[] = ["playground", "restaurant", "sports", "other"];

export function WalkInQuick() {
  const open = useUi((s) => s.walkIn);
  return (
    <Dialog open={open} onOpenChange={(o) => useUi.setState({ walkIn: o })}>
      <DialogContent className="glass-solid block max-h-[92dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-md">{open && <WalkInForm />}</DialogContent>
    </Dialog>
  );
}

function WalkInForm() {
  const db = useDb();
  const prices = db.workspace ?? { walkin_price_kid: 0, walkin_price_adult: 0 };
  const [kids, setKids] = useState(1);
  const [adults, setAdults] = useState(1);
  const [area, setArea] = useState<Area>("playground");
  const [amount, setAmount] = useState<number | null>(null); // null = use the price list
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(0);
  const auto = area === "playground" ? kids * prices.walkin_price_kid + adults * prices.walkin_price_adult : 0;
  const paid = amount ?? auto;
  const today = dateKey(useNow());
  const todayPeople = liveWalkIns(db)
    .filter((w) => dateKey(w.at) === today)
    .reduce((n, w) => n + people(w), 0);

  const save = (again: boolean) => {
    const ok = actions.logWalkIn({ kids, adults, area, amount: paid, note });
    if (!ok) return;
    setSaved((n) => n + 1);
    if (again) {
      setKids(1);
      setAdults(1);
      setAmount(null);
      setNote("");
    } else {
      setTimeout(() => useUi.setState({ walkIn: false }), 700);
    }
  };

  return (
    <div>
      <div className="p-5 pb-2">
        <p className="eyebrow">{t("Walk-in")}</p>
        <DialogTitle className="display mt-1 text-3xl">{t("Who just arrived?")}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-paper/55">
          {t("Today so far: {n} people.", { n: todayPeople })}
          {saved > 0 && <span className="ms-1 font-semibold text-brand">{t("Logged ✓")}</span>}
        </DialogDescription>
      </div>
      <div className="space-y-5 p-5">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold">{t("Kids")}</span>
            <Stepper big value={kids} onChange={setKids} label={t("Kids")} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold">{t("Adults")}</span>
            <Stepper big value={adults} onChange={setAdults} label={t("Adults")} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <Chip key={a} active={a === area} onClick={() => setArea(a)} className="px-4 py-2 text-sm">
              {t(AREA_LABEL[a])}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.14em] text-paper/50 uppercase">{t("Paid at the door ($)")}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="field tnum"
              value={paid}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <input className="field" placeholder={t("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("Note")} />
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[#0b0f0d] p-4">
        <Btn onClick={() => save(true)}>{t("Save and add another")}</Btn>
        <motion.div whileTap={{ scale: 0.96 }}>
          <Btn variant="primary" size="lg" onClick={() => save(false)}>
            {saved ? <Check className="size-5" /> : <DoorOpen className="size-5" />} {t("Log {n} people", { n: kids + adults })}
          </Btn>
        </motion.div>
      </div>
    </div>
  );
}
