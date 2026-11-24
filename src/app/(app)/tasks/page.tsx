"use client";

import { Repeat, Rocket } from "lucide-react";
import { useState } from "react";
import { Btn, PageHeader } from "@/components/kit";
import { RecurringDialog } from "@/components/recurring-list";
import { TaskBoard } from "@/components/task-board";
import { t } from "@/lib/i18n";
import { canCreateTasks, canManageRecurring } from "@/lib/permissions";
import { useMe } from "@/lib/store";
import { openComposer } from "@/lib/ui";

const COPY = {
  owner: ["All Tasks", "Every task, by priority", "Hand work to the Operations Manager, or assign anyone directly."],
  ops: ["All Tasks", "Assign. Prioritise. Track.", "Pass tasks on to the managers and staff, reassign and reprioritise in one place."],
  manager: ["Assign Tasks", "Your team's queue", "Assign tasks to your team, set priorities and follow them to completion."],
  employee: ["Tasks", "Tasks", ""],
} as const;

export default function TasksPage() {
  const me = useMe();
  const [eyebrow, title, sub] = COPY[me.role];
  const [schedules, setSchedules] = useState(false);
  return (
    <>
      <PageHeader eyebrow={t(eyebrow)} title={t(title)} sub={sub ? t(sub) : ""}>
        {canManageRecurring(me) && (
          <Btn
            size="lg"
            onClick={() => setSchedules(true)}
          >
            <Repeat className="size-5" /> {t("Recurring tasks")}
          </Btn>
        )}
        {canCreateTasks(me) && (
          <Btn variant="primary" size="lg" onClick={() => openComposer()}>
            <Rocket className="size-5" /> {me.role === "manager" ? t("Assign task") : t("Deploy task")}
          </Btn>
        )}
      </PageHeader>
      <TaskBoard />
      {canManageRecurring(me) && <RecurringDialog open={schedules} onOpenChange={setSchedules} />}
    </>
  );
}
