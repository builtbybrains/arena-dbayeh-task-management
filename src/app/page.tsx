"use client";

import { ArrowRight, Check, ChevronLeft, CloudOff, Delete, FlaskConical, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArenaBackdrop } from "@/components/arena-scene";
import { Field } from "@/components/forms";
import { ArenaMark, Avatar, Btn, EASE, Loader, Logo } from "@/components/kit";
import { LangToggle } from "@/components/shell";
import { t, useLang } from "@/lib/i18n";
import { homeFor, ROLE_PERMISSIONS } from "@/lib/permissions";
import { useSync } from "@/lib/repository";
import { DEMO_PROFILES } from "@/lib/seed";
import { enterMode, leaveMode, setupWorkspace, signInWithPin, switchProfile, syncNow, useApp } from "@/lib/store";
import { ROLE_RANK, type User } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function StartPage() {
  useLang((s) => s.lang);
  const ready = useApp((s) => s.ready);
  const mode = useApp((s) => s.mode);
  const db = useApp((s) => s.db);
  const userId = useApp((s) => s.userId);
  const router = useRouter();
  const me = db?.users.find((u) => u.id === userId);

  // A phone that is already signed in to the workspace goes straight in.
  useEffect(() => {
    if (mode === "workspace" && me) router.replace(homeFor(me.role));
  }, [mode, me, router]);

  if (!ready) return <Loader label={t("Opening Arena OS")} />;
  const choosing = mode !== null;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <ArenaBackdrop className="absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent,rgb(7_9_8/72%)_62%,#070908)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_46%_30%_at_50%_62%,rgb(7_9_8/82%),transparent_78%)]" />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-ink/80 backdrop-blur-[3px] transition-opacity duration-700",
          choosing ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-5">
        <header className="flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-2">
            {mode === "sample" && (
              <span className="flex h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 text-[11px] font-bold tracking-[0.14em] text-warn uppercase">
                <span className="size-1.5 rounded-full bg-warn" /> {t("Sample data")}
              </span>
            )}
            <LangToggle />
          </div>
        </header>

        <section className={cn("flex flex-1 flex-col items-center text-center", choosing ? "pt-6" : "justify-center py-10")}>
          <motion.div layout initial={{ opacity: 0, scale: 0.6, filter: "blur(12px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1, ease: EASE }}>
            <ArenaMark className={cn("mx-auto w-auto text-paper drop-shadow-[0_0_40px_rgb(34_199_63/55%)]", choosing ? "h-9" : "h-20 md:h-24")} />
          </motion.div>
          <motion.h1
            layout
            className={cn("display mt-4", choosing ? "text-4xl" : "text-7xl md:text-[9rem]")}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          >
            Arena <span className="text-brand">OS</span>
          </motion.h1>
          {!choosing && (
            <motion.p
              className="mt-3 font-display text-base font-bold tracking-[0.22em] text-paper/80 uppercase md:text-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.55 }}
            >
              {t("One Arena. One Team. Total Visibility.")}
            </motion.p>
          )}

          <AnimatePresence mode="popLayout" initial={false}>
            {mode === null && <Hero key="hero" />}
            {mode === "sample" && <SamplePicker key="sample" />}
            {mode === "workspace" && !me && <Workspace key="ws" />}
          </AnimatePresence>
        </section>

        <footer className="pt-6 text-center text-xs text-paper/40">{t("Built for Arena Dbayeh by Brains AI Solutions")}</footer>
      </div>
    </main>
  );
}

const fade = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.45, ease: EASE },
};

function Hero() {
  return (
    <motion.div {...fade} className="mt-8 flex w-full max-w-md flex-col items-center">
      <p className="max-w-sm text-sm leading-relaxed text-paper/65">
        {t("Tasks, events, walk-ins and reports for the Arena Dbayeh team, on every phone.")}
      </p>
      <Btn variant="primary" size="lg" className="mt-7 h-14 w-full text-lg" onClick={() => void enterMode("workspace")}>
        {t("Open the Arena workspace")} <ArrowRight className="size-5 rtl:rotate-180" />
      </Btn>
      <Btn variant="ghost" className="mt-3 w-full" onClick={() => void enterMode("sample")}>
        <FlaskConical className="size-4" /> {t("Try it with sample data")}
      </Btn>
      <p className="mt-3 text-xs text-paper/45">{t("Sample data is fictional and stays on this device. The workspace is shared with your team.")}</p>
    </motion.div>
  );
}

function SamplePicker() {
  const db = useApp((s) => s.db);
  const users = useMemo(() => new Map((db?.users ?? []).map((u) => [u.id, u])), [db]);
  return (
    <motion.div {...fade} className="mt-6 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-start">
          <p className="eyebrow">{t("Choose a profile")}</p>
          <p className="mt-1 text-sm text-paper/60">{t("Each profile sees the same sample data with different access. All names are fictional.")}</p>
        </div>
        <Btn size="sm" variant="subtle" onClick={leaveMode}>
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t("Back")}
        </Btn>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_PROFILES.map((p, n) => {
          const u = users.get(p.userId);
          if (!u) return null;
          return (
            <motion.button
              key={p.userId}
              type="button"
              onClick={() => switchProfile(u.id)}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 * n, ease: EASE }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              className="glass group rounded-3xl p-4 text-start transition-colors hover:border-brand/60"
            >
              <div className="flex items-center gap-3">
                <Avatar user={u} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="display text-xl">{t(p.label)}</p>
                  <p className="truncate text-xs text-paper/55">{u.name}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-paper/30 transition group-hover:translate-x-1 group-hover:text-brand rtl:rotate-180" />
              </div>
              <ul className="mt-3 space-y-1.5">
                {ROLE_PERMISSIONS[u.role].map((perm) => (
                  <li key={perm} className="flex items-start gap-2 text-xs leading-snug text-paper/65">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> {t(perm)}
                  </li>
                ))}
              </ul>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function Workspace() {
  const db = useApp((s) => s.db);
  const status = useSync((s) => s.status);
  if (!db) return null;
  if (db.users.length === 0) {
    // Never offer the first-run setup unless the server confirmed it is empty.
    if (status !== "synced") return <Connecting offline={status === "offline" || status === "error"} />;
    return <Setup />;
  }
  return <SignIn users={db.users} />;
}

function Connecting({ offline }: { offline: boolean }) {
  return (
    <motion.div {...fade} className="mt-10 flex max-w-sm flex-col items-center gap-4">
      {offline ? (
        <>
          <CloudOff className="size-10 text-warn" />
          <p className="text-sm text-paper/70">{t("Cannot reach the Arena workspace. Check the internet connection and try again.")}</p>
          <div className="flex gap-2">
            <Btn onClick={() => void syncNow()}>
              <RefreshCw className="size-4" /> {t("Try again")}
            </Btn>
            <Btn variant="subtle" onClick={leaveMode}>
              {t("Back")}
            </Btn>
          </div>
        </>
      ) : (
        <>
          <div className="shimmer h-1 w-40 rounded-full" />
          <p className="eyebrow">{t("Connecting to the workspace")}</p>
        </>
      )}
    </motion.div>
  );
}

function Setup() {
  const [venue, setVenue] = useState("Arena Dbayeh");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = pin2.length === 4 && pin !== pin2;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin !== pin2) return;
    setBusy(true);
    await setupWorkspace({ venue, ownerName: name, pin });
    setBusy(false);
  };
  return (
    <motion.form {...fade} onSubmit={submit} className="glass mt-6 w-full max-w-md space-y-4 rounded-3xl p-5 text-start">
      <div>
        <p className="eyebrow">{t("First time here")}</p>
        <h2 className="display mt-1 text-3xl">{t("Set up the workspace")}</h2>
        <p className="mt-1.5 text-sm text-paper/60">
          {t("Start as the Owner. Next you can add the Operations Manager, the Restaurant and Playground managers and their teams, each with their own PIN.")}
        </p>
      </div>
      <Field label={t("Venue name")} htmlFor="ws-venue">
        <input id="ws-venue" className="field" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </Field>
      <Field label={t("Owner's name")} htmlFor="ws-owner">
        <input id="ws-owner" className="field text-base font-semibold" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("4-digit PIN")} htmlFor="ws-pin">
          <input id="ws-pin" className="field tnum text-center text-xl tracking-[0.5em]" inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
        </Field>
        <Field label={t("Repeat PIN")} htmlFor="ws-pin2">
          <input id="ws-pin2" className={cn("field tnum text-center text-xl tracking-[0.5em]", mismatch && "border-crit")} inputMode="numeric" type="password" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
        </Field>
      </div>
      {mismatch && <p className="text-xs text-crit">{t("The two PINs are different.")}</p>}
      <p className="flex items-start gap-2 text-xs text-paper/50">
        <ShieldCheck className="mt-px size-4 shrink-0 text-brand" />
        {t("Data is shared with everyone who opens this link. PINs keep colleagues out of each other's screens; they are not bank-grade security.")}
      </p>
      <div className="flex justify-between gap-2">
        <Btn variant="subtle" onClick={leaveMode}>
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t("Back")}
        </Btn>
        <Btn variant="primary" type="submit" disabled={busy || name.trim().length < 2 || pin.length !== 4 || pin !== pin2}>
          {t("Create workspace")} <ArrowRight className="size-4 rtl:rotate-180" />
        </Btn>
      </div>
    </motion.form>
  );
}

function SignIn({ users }: { users: User[] }) {
  const [who, setWho] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const active = users
    .filter((u) => u.active_status)
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name));
  const shown = q ? active.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())) : active;

  if (who) return <PinPad user={who} onBack={() => setWho(null)} />;
  return (
    <motion.div {...fade} className="mt-6 w-full max-w-2xl">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 text-start">
        <div>
          <p className="eyebrow">{t("Sign in")}</p>
          <p className="mt-1 text-sm text-paper/60">{t("Tap your name, then enter your PIN.")}</p>
        </div>
        <Btn size="sm" variant="subtle" onClick={leaveMode}>
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t("Back")}
        </Btn>
      </div>
      {active.length > 8 && <input className="field mb-3" placeholder={t("Search your name")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Search your name")} />}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setWho(u)}
            className="glass flex items-center gap-3 rounded-2xl p-3 text-start transition hover:border-brand/60"
          >
            <Avatar user={u} size={42} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-semibold">{u.name}</span>
              <span className="block truncate text-xs text-paper/55">{t(u.title)}</span>
            </span>
            <ArrowRight className="size-4 text-paper/30 rtl:rotate-180" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function PinPad({ user, onBack }: { user: User; onBack: () => void }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(0);
  const busy = useRef(false);

  const pinRef = useRef("");
  const set = (v: string) => {
    pinRef.current = v;
    setPin(v);
  };
  const press = useCallback(
    (d: string) => {
      if (busy.current || pinRef.current.length >= 4) return;
      const next = pinRef.current + d;
      set(next);
      if (next.length < 4) return;
      busy.current = true;
      void signInWithPin(user.id, next).then((ok) => {
        busy.current = false;
        if (!ok) {
          setWrong((n) => n + 1);
          set("");
        }
      });
    },
    [user.id],
  );
  const back = useCallback(() => set(pinRef.current.slice(0, -1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, press, back]);

  const key = "glass grid h-16 place-items-center rounded-2xl font-display text-3xl font-bold transition active:scale-95 active:bg-brand/20";
  return (
    <motion.div {...fade} className="mt-6 flex w-full max-w-xs flex-col items-center">
      <Avatar user={user} size={64} />
      <p className="display mt-3 text-2xl">{user.name}</p>
      <p className="flex items-center gap-1.5 text-sm text-paper/55">
        <KeyRound className="size-4" /> {t("Enter your PIN")}
      </p>
      <motion.div key={wrong} className="my-5 flex gap-3" dir="ltr" animate={wrong ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
        {[0, 1, 2, 3].map((n) => (
          <span key={n} className={cn("size-4 rounded-full border-2", n < pin.length ? "border-brand bg-brand" : "border-white/30")} />
        ))}
      </motion.div>
      {wrong > 0 && <p className="-mt-2 mb-3 text-sm text-crit">{t("Wrong PIN. Ask the Owner or Operations Manager if you forgot it.")}</p>}
      <div className="grid w-full grid-cols-3 gap-2" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={cn(key, "text-base")} onClick={onBack} aria-label={t("Back")}>
          <ChevronLeft className="size-6" />
        </button>
        <button type="button" className={key} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={key} onClick={back} aria-label={t("Delete")}>
          <Delete className="size-6" />
        </button>
      </div>
    </motion.div>
  );
}
