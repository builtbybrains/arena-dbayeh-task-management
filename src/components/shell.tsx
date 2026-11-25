"use client";

import {
  Bell,
  BellRing,
  Building2,
  CalendarDays,
  ChartColumn,
  Cloud,
  CloudOff,
  DoorOpen,
  Ellipsis,
  Languages,
  ListChecks,
  LogOut,
  Network,
  Radar,
  Rocket,
  RotateCcw,
  Send,
  Settings,
  Sun,
  Target,
  TrendingUp,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AttentionList } from "@/components/activity";
import { ArenaMark, Avatar, Btn, EASE, Loader, Logo } from "@/components/kit";
import { TaskComposer } from "@/components/task-composer";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WalkInQuick } from "@/components/walk-in-quick";
import { setLang, t, useLang } from "@/lib/i18n";
import { canAccessRoute, homeFor, isCompanyWide, navFor, type NavItem } from "@/lib/permissions";
import { useSync } from "@/lib/repository";
import { notificationsFor, type AttentionItem } from "@/lib/selectors";
import {
  actions,
  enableBrowserNotifications,
  leaveMode,
  resetDemo,
  signOut,
  setVenue,
  switchProfile,
  syncNow,
  useAllVenuesDb,
  useApp,
  useDb,
  useMe,
  useNow,
  useVenueId,
} from "@/lib/store";
import { ARENA, venueName, venueOf, venuesOf } from "@/lib/scope";
import { dateKey, fmtAgo, fmtKeyLong, fmtTime } from "@/lib/time";
import type { User } from "@/lib/types";
import { closeDemo, openDemo, showOnBoard, useUi, type BoardQuick } from "@/lib/ui";
import { dueReminders, type ReminderItem } from "@/lib/venue";
import { cn } from "@/lib/utils";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  radar: Radar,
  tasks: ListChecks,
  rocket: Rocket,
  send: Send,
  network: Network,
  users: Users,
  reports: ChartColumn,
  settings: Settings,
  sun: Sun,
  target: Target,
  trend: TrendingUp,
  user: UserIcon,
  building: Building2,
  calendar: CalendarDays,
  door: DoorOpen,
};

const SHORT: Record<string, string> = {
  "Command Center": "Command",
  "All Tasks": "Tasks",
  "Task Deployment": "Deploy",
  "Assign Tasks": "Assign",
  "Team Activity": "Team",
  "My Department": "My Dept",
  Departments: "Depts",
  Employees: "Team",
  "My Progress": "Progress",
  "My Tasks": "Tasks",
};

const shortLabel = (label: string) => t(SHORT[label] ?? label);

/** Gate + chrome for every signed-in screen. Access is checked here centrally. */
export function AppShell({ children }: { children: ReactNode }) {
  const ready = useApp((s) => s.ready);
  const me = useApp((s) => (s.db && s.userId ? (s.db.users.find((u) => u.id === s.userId) ?? null) : null));
  const switching = useApp((s) => s.switchingTo !== null);
  const mode = useApp((s) => s.mode);
  const pathname = usePathname();
  const router = useRouter();
  const allowed = me ? canAccessRoute(me, pathname) : false;

  useEffect(() => {
    if (!ready || switching) return;
    if (!me) router.replace("/");
    else if (!allowed) router.replace(homeFor(me.role));
  }, [ready, me, allowed, switching, router]);

  if (!ready || !me || !allowed) return <Loader />;

  const items = navFor(me);
  return (
    <div className="min-h-dvh">
      <Dock items={items} pathname={pathname} me={me} />
      <TopBar me={me} />
      <main className="print-root mx-auto w-full max-w-[1560px] px-4 pt-20 pb-28 md:pe-8 md:pb-12 md:ps-[104px]">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {children}
        </motion.div>
      </main>
      <MobileDock items={items} pathname={pathname} />
      {mode === "sample" ? <DemoControls /> : <AccountMenu />}
      <TaskComposer />
      <WalkInQuick />
    </div>
  );
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function Dock({ items, pathname, me }: { items: NavItem[]; pathname: string; me: User }) {
  const label =
    "relative whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/dock:opacity-100 group-focus-within/dock:opacity-100";
  return (
    <nav
      aria-label={t("Main")}
      className="no-print group/dock glass fixed top-1/2 start-4 z-40 hidden w-[60px] -translate-y-1/2 flex-col gap-1 overflow-hidden rounded-[28px] p-2 transition-[width] duration-300 ease-out focus-within:w-60 hover:w-60 md:flex"
    >
      <Link href={homeFor(me.role)} className="mb-2 flex h-11 items-center gap-3 ps-0.5" aria-label={t("Arena OS home")}>
        <ArenaMark className="h-[18px] w-[44px] shrink-0 text-paper" />
        <span className={cn(label, "display text-base")}>
          Arena <span className="text-brand">OS</span>
        </span>
      </Link>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors",
              on ? "text-brand-soft" : "text-paper/60 hover:text-paper",
            )}
          >
            {on && (
              <motion.span
                layoutId="dock-active"
                className="absolute inset-0 rounded-2xl bg-brand/14 ring-1 ring-brand/40 ring-inset"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className="relative size-5 shrink-0" />
            <span className={label}>{t(item.label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={openDemo}
        className="mt-2 flex h-11 items-center gap-3 rounded-2xl ps-1 text-start text-sm font-semibold text-paper/70 hover:text-paper"
      >
        <Avatar user={me} size={36} />
        <span className={label}>{t("Account")}</span>
      </button>
    </nav>
  );
}

function MobileDock({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [more, setMore] = useState(false);
  const main = items.filter((i) => i.mobile);
  const rest = items.filter((i) => !i.mobile);
  const restActive = rest.some((i) => isActive(pathname, i.href));
  const cell = "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold";
  return (
    <>
      <nav aria-label={t("Main")} className="no-print glass-solid fixed inset-x-3 bottom-3 z-40 flex items-stretch rounded-3xl p-1.5 md:hidden">
        {main.map((item) => {
          const Icon = ICONS[item.icon];
          const on = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn(cell, on ? "text-brand-soft" : "text-paper/55")}>
              {on && <motion.span layoutId="mobile-dock-active" className="absolute inset-0 rounded-2xl bg-brand/14" />}
              <Icon className="relative size-5" />
              <span className="relative truncate">{shortLabel(item.label)}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button type="button" onClick={() => setMore(true)} className={cn(cell, restActive ? "text-brand-soft" : "text-paper/55")}>
            {restActive && <span className="absolute inset-0 rounded-2xl bg-brand/14" />}
            <Ellipsis className="relative size-5" />
            <span className="relative truncate">{t("More")}</span>
          </button>
        )}
      </nav>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="glass-solid block rounded-3xl p-4 sm:max-w-sm">
          <DialogTitle className="display mb-3 text-2xl">{t("More")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Other screens")}</DialogDescription>
          <div className="grid grid-cols-2 gap-2">
            {rest.map((item) => {
              const Icon = ICONS[item.icon];
              const on = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMore(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl border p-3 text-sm font-semibold",
                    on ? "border-brand/60 bg-brand/12 text-brand-soft" : "border-white/8 bg-white/[0.03] text-paper/80",
                  )}
                >
                  <Icon className="size-5 shrink-0" /> {t(item.label)}
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TopBar({ me }: { me: User }) {
  const now = useNow();
  const mode = useApp((s) => s.mode);
  return (
    <header className="no-print pointer-events-none fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-2 bg-gradient-to-b from-ink via-ink/85 to-transparent px-4 md:pe-8 md:ps-[104px]">
      <div className="pointer-events-auto flex min-w-0 items-center gap-3">
        <Logo compact className="sm:hidden" />
        <Logo className="hidden sm:flex md:hidden" />
        <p className="hidden text-sm text-paper/55 md:block">
          <span className="font-semibold text-paper/85">{fmtKeyLong(dateKey(now))}</span>
          <span className="tnum mx-2 text-paper/30">·</span>
          <span className="tnum">{fmtTime(now)}</span>
        </p>
      </div>
      <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
        <VenueSwitch me={me} />
        <button
          type="button"
          onClick={() => useUi.setState({ walkIn: true })}
          className="flex h-10 items-center gap-1.5 rounded-full bg-brand px-3 text-sm font-bold text-ink shadow-[0_8px_26px_-10px_rgb(34_199_63/80%)]"
          aria-label={t("Log a walk-in")}
        >
          <DoorOpen className="size-4" />
          <span className="hidden sm:inline">{t("Walk-in")}</span>
        </button>
        <LangToggle />
        <Alerts me={me} />
        {mode === "sample" ? (
          <button
            type="button"
            onClick={openDemo}
            className="hidden h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 text-[11px] font-bold tracking-[0.14em] text-warn uppercase sm:flex"
            title={t("Sample data: fictional people and tasks")}
          >
            <span className="size-1.5 rounded-full bg-warn" />
            {t("Sample")}
          </button>
        ) : (
          <SyncDot />
        )}
        <button
          type="button"
          onClick={openDemo}
          className="glass flex items-center gap-2.5 rounded-full p-1 sm:pe-4"
          aria-label={t("Signed in as {name}. Open account menu", { name: me.name })}
        >
          <Avatar user={me} size={32} />
          <span className="hidden text-start leading-tight sm:block">
            <span className="block text-sm font-semibold">{me.name}</span>
            <span className="block text-[11px] text-paper/55">{t(me.title)}</span>
          </span>
        </button>
      </div>
    </header>
  );
}

/** Owners flip between Arena and Money Mondo; everyone else sees which venue they are in. */
function VenueSwitch({ me }: { me: User }) {
  const full = useAllVenuesDb();
  const current = useVenueId();
  const venues = venuesOf(full);
  if (me.role !== "owner") {
    if (current === ARENA) return null;
    return (
      <span className="hidden h-8 items-center rounded-full border border-med/40 bg-med/10 px-3 text-[11px] font-bold tracking-[0.1em] text-med uppercase sm:flex">
        {venueName(full, current)}
      </span>
    );
  }
  return (
    <div className="glass flex h-10 items-center rounded-full p-1" role="group" aria-label={t("Venue")}>
      {venues.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => setVenue(v.id)}
          aria-pressed={current === v.id}
          className={cn(
            "h-8 rounded-full px-2.5 text-xs font-bold whitespace-nowrap transition sm:px-3",
            current === v.id ? "bg-med text-ink" : "text-paper/60 hover:text-paper",
          )}
        >
          <span className="sm:hidden">{v.id === ARENA ? "A" : v.name.split(" ").map((w) => w[0]).join("")}</span>
          <span className="hidden sm:inline">{v.name}</span>
        </button>
      ))}
    </div>
  );
}

export function LangToggle({ className }: { className?: string }) {
  const lang = useLang((s) => s.lang);
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className={cn("glass grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-bold", className)}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      title={lang === "ar" ? "English" : "العربية"}
    >
      {lang === "ar" ? "EN" : "ع"}
    </button>
  );
}

function SyncDot() {
  const { status, lastSync, pending } = useSync();
  const now = useNow();
  const ok = status === "synced";
  const label =
    status === "offline"
      ? t("Offline. {n} changes will send when the connection is back.", { n: pending })
      : status === "syncing"
        ? t("Saving…")
        : lastSync
          ? t("Saved for everyone · {ago}", { ago: fmtAgo(lastSync, now) })
          : t("Connecting…");
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={cn(
        "glass hidden size-10 place-items-center rounded-full sm:grid",
        status === "offline" ? "text-warn" : ok ? "text-brand" : "text-paper/60",
      )}
      title={label}
      aria-label={label}
    >
      {status === "offline" ? <CloudOff className="size-[18px]" /> : <Cloud className={cn("size-[18px]", status === "syncing" && "animate-pulse")} />}
    </button>
  );
}

/** Real workspace: who is signed in on this phone, language, notifications, sign out. */
function AccountMenu() {
  const open = useUi((s) => s.demoOpen);
  const me = useMe();
  const router = useRouter();
  const lang = useLang((s) => s.lang);
  const { status, pending } = useSync();
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDemo()}>
      <DialogContent className="glass-solid block max-h-[88dvh] overflow-y-auto rounded-3xl p-5 sm:max-w-md">
        <div className="flex items-center gap-3">
          <Avatar user={me} size={52} />
          <div className="min-w-0">
            <DialogTitle className="display text-2xl">{me.name}</DialogTitle>
            <DialogDescription className="text-paper/60">{t(me.title)}</DialogDescription>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <Row icon={<Languages className="size-4" />} label={t("Language")}>
            <div className="glass inline-flex rounded-full p-1">
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn("rounded-full px-3 py-1 text-sm font-semibold", lang === l ? "bg-brand text-ink" : "text-paper/65")}
                >
                  {l === "en" ? "English" : "العربية"}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<BellRing className="size-4" />} label={t("Phone notifications")}>
            {notif === "granted" ? (
              <span className="text-sm font-semibold text-brand">{t("On")}</span>
            ) : notif === "unsupported" ? (
              <span className="text-xs text-paper/50">{t("Not supported here")}</span>
            ) : notif === "denied" ? (
              <span className="text-xs text-paper/50">{t("Blocked in browser settings")}</span>
            ) : (
              <Btn size="sm" onClick={async () => setNotif((await enableBrowserNotifications()) ? "granted" : Notification.permission)}>
                {t("Turn on")}
              </Btn>
            )}
          </Row>
          <Row icon={status === "offline" ? <CloudOff className="size-4" /> : <Cloud className="size-4" />} label={t("Sync")}>
            <span className={cn("text-sm font-semibold", status === "offline" ? "text-warn" : "text-brand")}>
              {status === "offline" ? t("Offline ({n} waiting)", { n: pending }) : status === "syncing" ? t("Saving…") : t("Up to date")}
            </span>
          </Row>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-paper/45">
          {t("Reminders pop up while Arena OS is open. With phone notifications on, they also appear when the tab is in the background.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Btn
            variant="danger"
            onClick={() => {
              closeDemo();
              signOut();
              router.push("/");
            }}
          >
            <LogOut className="size-4" /> {t("Sign out")}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-semibold text-paper/80">
        <span className="text-brand">{icon}</span> {label}
      </span>
      {children}
    </div>
  );
}

/** Demo-only profile switcher and reset. Not an authentication system. */
function DemoControls() {
  const open = useUi((s) => s.demoOpen);
  const me = useMe();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);

  const full = useAllVenuesDb();
  // The sample switcher lists every profile in both venues.
  const groups = useMemo(() => {
    const exec = full.users.filter((u) => u.role === "owner" || u.role === "ops");
    return [
      { label: t("Leadership"), users: exec },
      ...full.departments.map((d) => ({
        label: venueOf(d) === ARENA ? t(d.name) : `${venueName(full, venueOf(d))} · ${t(d.name)}`,
        users: full.users.filter((u) => u.department_id === d.id).sort((a, b) => (a.role === "manager" ? -1 : b.role === "manager" ? 1 : 0)),
      })),
    ].filter((g) => g.users.length > 0);
  }, [full]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          closeDemo();
          setConfirm(false);
        }
      }}
    >
      <DialogContent className="glass-solid block max-h-[88dvh] overflow-x-hidden overflow-y-auto rounded-3xl p-0 sm:max-w-2xl">
        <div className="p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow !text-warn">{t("Sample data")}</p>
              <DialogTitle className="display mt-1 text-3xl">{t("Switch profile")}</DialogTitle>
            </div>
            <LangToggle />
          </div>
          <DialogDescription className="mt-2 text-paper/60">
            {t("Every person and task here is fictional sample data. Pick a profile to see the same data from another role.")}
          </DialogDescription>
        </div>
        <div className="space-y-4 px-5 pb-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{g.label}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {g.users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      closeDemo();
                      if (u.id !== me.id) switchProfile(u.id);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border p-2 text-start transition",
                      u.id === me.id
                        ? "border-brand/60 bg-brand/12"
                        : "border-white/8 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]",
                    )}
                  >
                    <Avatar user={u} size={34} />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-sm font-semibold">{u.name}</span>
                      <span className="block truncate text-[11px] text-paper/55">
                        {u.id === me.id ? t("Current profile") : t(u.title)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0b0f0d] p-4">
          {confirm ? (
            <>
              <p className="min-w-0 flex-1 text-sm text-paper/75">
                {t("Reset everything to the original sample data? Changes made in this demo will be lost.")}
              </p>
              <Btn size="sm" onClick={() => setConfirm(false)}>
                {t("Cancel")}
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => {
                  resetDemo();
                  setConfirm(false);
                  closeDemo();
                }}
              >
                {t("Yes, reset demo")}
              </Btn>
            </>
          ) : (
            <>
              <Btn size="sm" variant="subtle" onClick={() => setConfirm(true)}>
                <RotateCcw className="size-4" /> {t("Reset demo")}
              </Btn>
              <Btn
                size="sm"
                variant="subtle"
                onClick={() => {
                  closeDemo();
                  leaveMode();
                  router.push("/");
                }}
              >
                <LogOut className="size-4" /> {t("Leave sample data")}
              </Btn>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Alert bell: reminders that are due, tasks over their time allowed, overdue work and anything else waiting on this person. */
function Alerts({ me }: { me: User }) {
  const db = useDb();
  const now = useNow();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => notificationsFor(db, me, now), [db, me, now]);
  const reminders = useMemo(() => dueReminders(db, me, now), [db, me, now]);
  const total = items.length + reminders.length;
  const critical = items.some((i) => i.severity === "critical");

  const go = (item: AttentionItem) => {
    setOpen(false);
    if (me.role === "employee") {
      router.push("/my-tasks");
      return;
    }
    const quick: BoardQuick =
      item.kind === "over_time"
        ? "over_time"
        : item.kind === "unassigned"
          ? "unassigned"
          : item.kind === "paused_long"
            ? "paused"
            : item.kind === "escalated"
              ? "open"
              : "overdue";
    showOnBoard({
      quick,
      dept: isCompanyWide(me) ? (item.department_id ?? "") : "",
      assignee: item.kind === "over_time" || item.kind === "unresolved" ? (item.user_id ?? "") : "",
    });
    router.push("/tasks");
  };

  const openReminder = (r: ReminderItem) => {
    setOpen(false);
    if (r.task_id) router.push(me.role === "employee" ? "/my-day" : "/tasks");
    else router.push("/calendar");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass relative grid size-10 place-items-center rounded-full"
        aria-label={total === 1 ? t("1 alert") : t("{n} alerts", { n: total })}
      >
        <Bell className="size-[18px]" />
        {total > 0 && (
          <span
            className={cn(
              "tnum absolute -top-1 -end-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-ink",
              critical ? "bg-crit" : reminders.length ? "bg-med" : "bg-warn",
            )}
          >
            {total}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-solid block max-h-[88dvh] overflow-x-hidden overflow-y-auto rounded-3xl p-5 sm:max-w-lg">
          <p className="eyebrow">{t("Alerts")}</p>
          <DialogTitle className="display mt-1 text-3xl">
            {total === 0 ? t("All clear") : total === 1 ? t("1 alert") : t("{n} alerts", { n: total })}
          </DialogTitle>
          <DialogDescription className="mt-1.5 mb-4 text-paper/55">
            {t("Reminders, tasks running past their time allowed, overdue work and other items that need attention.")}
          </DialogDescription>
          {reminders.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{t("Reminders")}</p>
              <ul className="space-y-1.5">
                {reminders.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-med/30 bg-med/8 p-3">
                    <BellRing className="mt-0.5 size-4 shrink-0 text-med" />
                    <button type="button" onClick={() => openReminder(r)} className="min-w-0 flex-1 text-start">
                      <span className="block text-sm font-semibold">{r.title}</span>
                      {r.note && <span className="block text-xs text-paper/60">{r.note}</span>}
                      <span className="tnum block text-[11px] text-paper/45">{fmtAgo(r.at, now)}</span>
                    </button>
                    {r.reminder?.link && (
                      <a href={r.reminder.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center rounded-full bg-brand px-3 text-xs font-bold text-ink">
                        {t("Open post")}
                      </a>
                    )}
                    {r.reminder && (
                      <Btn size="sm" variant="subtle" onClick={() => actions.dismissReminder(r.id)}>
                        {t("Done")}
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(items.length > 0 || reminders.length === 0) && <AttentionList items={items} onItem={go} limit={8} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
