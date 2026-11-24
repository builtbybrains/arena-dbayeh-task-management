"use client";

import {
  Activity,
  CircleCheck,
  Clock,
  Gauge,
  ListChecks,
  Play,
  Radar,
  Rocket,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActivityFeed, AttentionPanel } from "@/components/activity";
import { ArenaMap } from "@/components/arena-scene";
import { DepartmentSheet } from "@/components/department";
import { Btn, Chip, PageHeader, Panel, Stat } from "@/components/kit";
import { t } from "@/lib/i18n";
import { canCreateTasks } from "@/lib/permissions";
import { companyKpis, departmentNodes, HEALTH_COLOR, healthOf } from "@/lib/selectors";
import { useDb, useMe, useNow } from "@/lib/store";
import { fmtDuration, greeting } from "@/lib/time";
import { openComposer, showOnBoard } from "@/lib/ui";
import { cn } from "@/lib/utils";

export default function CommandCenterPage() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const k = useMemo(() => companyKpis(db, now), [db, now]);
  const nodes = useMemo(() => departmentNodes(db, now), [db, now]);
  const [dept, setDept] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <PageHeader
        eyebrow={t("Executive Command Center")}
        title={t("{greeting}, {name}", { greeting: greeting(now), name: me.name.split(" ")[0] })}
        sub={t("One live view of every department: who is working, what is done, and what needs you.")}
      >
        {canCreateTasks(me) && (
          <Btn variant="primary" size="lg" onClick={() => openComposer()}>
            <Rocket className="size-5" /> {t("Deploy task")}
          </Btn>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("Total employees")}
          value={k.employees}
          icon={<Users className="size-4" />}
          sub={t("across {n} departments", { n: db.departments.length })}
        />
        <Stat label={t("Working now")} value={k.working} tone="brand" icon={<Zap className="size-4" />} sub={t("with a task timer running")} />
        <Stat label={t("Tasks assigned today")} value={k.assigned} icon={<ListChecks className="size-4" />} sub={t("due today")} />
        <Stat label={t("In progress")} value={k.in_progress} tone="brand" icon={<Play className="size-4" />} sub={t("running right now")} />
        <Stat label={t("Completed")} value={k.completed} icon={<CircleCheck className="size-4" />} sub={t("of today's tasks")} />
        <Stat
          label={t("Overdue")}
          value={k.overdue}
          tone={k.overdue ? "crit" : "default"}
          icon={<TriangleAlert className="size-4" />}
          sub={
            k.overdue_earlier
              ? t("{n} from earlier days · open the list", { n: k.overdue_earlier })
              : t("past deadline · open the list")
          }
          onClick={() => {
            showOnBoard({ quick: "overdue" });
            router.push("/tasks");
          }}
        />
        <Stat
          label={t("Completion rate")}
          value={k.completion_rate}
          format={(n) => `${Math.round(n)}%`}
          icon={<Gauge className="size-4" />}
          sub={t("completed ÷ assigned today")}
        />
        <Stat
          label={t("Tracked time")}
          text={fmtDuration(k.tracked_seconds)}
          icon={<Clock className="size-4" />}
          sub={t("active task time today")}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel
          title={me.business === "mm" ? t("Money Mondo map") : t("Arena operations map")}
          icon={<Radar className="size-5" />}
          right={
            <p className="hidden items-center gap-3 text-[11px] text-paper/50 sm:flex">
              {[
                ["#22c73f", "No overdue"],
                ["#ffc24b", "1-2 overdue"],
                ["#ff4d5e", "3+ overdue"],
              ].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: c }} /> {t(l)}
                </span>
              ))}
            </p>
          }
        >
          <ArenaMap nodes={nodes} selectedId={dept} onSelect={setDept} center={me.business === "mm" ? "Mondo" : "Arena"} className="h-[380px] md:h-[440px]" />
          <p className="mt-2 text-xs text-paper/45">
            {t(
              "Select a department to open its tasks, people and performance. Node size shows today’s workload, the arc shows completion, moving dots show people working.",
            )}
          </p>
        </Panel>

        <Panel title={t("Needs attention")} icon={<TriangleAlert className="size-5" />}>
          <AttentionPanel onDept={setDept} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          title={t("Live activity")}
          icon={<Activity className="size-5" />}
          right={
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-brand uppercase">
              <span className="live-dot size-1.5 rounded-full bg-brand" /> {t("Live")}
            </span>
          }
        >
          <ActivityFeed limit={12} />
        </Panel>

        <Panel title={t("Departments today")}>
          <ul className="space-y-1.5">
            {nodes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setDept(n.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-start transition hover:bg-white/5",
                    dept === n.id && "bg-white/6",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{t(n.name)}</span>
                    <span className="tnum flex shrink-0 items-center gap-3 text-xs text-paper/55">
                      {n.active > 0 && <span className="text-brand">{t("{n} working", { n: n.active })}</span>}
                      {n.overdue > 0 && <span className="font-semibold text-crit">{t("{n} overdue", { n: n.overdue })}</span>}
                      <span>
                        {n.completed}/{n.assigned}
                      </span>
                      <span className="w-9 text-end font-semibold text-paper">{Math.round(n.completion)}%</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${n.completion}%`, background: HEALTH_COLOR[healthOf(n)] }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="no-print mt-3 flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
            {nodes.map((n) => (
              <Chip key={n.id} active={dept === n.id} onClick={() => setDept(n.id)}>
                {n.short}
              </Chip>
            ))}
          </div>
        </Panel>
      </div>

      <DepartmentSheet deptId={dept} onClose={() => setDept(null)} />
    </>
  );
}
