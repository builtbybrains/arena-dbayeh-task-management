"use client";

// Recurring tasks, from the task board's "Recurring tasks" button: every
// schedule this person may see, with pause / edit / delete. New ones are made
// in the task composer with "Repeat this task".

import { ClipboardList, Pause, Pencil, Play, Plus, Repeat as RepeatIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar, Btn, Empty } from "@/components/kit";
import { describeRepeat } from "@/components/repeat-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RecurringForm } from "@/components/venue-dialogs";
import { t } from "@/lib/i18n";
import { idx } from "@/lib/selectors";
import { actions, useDb, useMe, useNow } from "@/lib/store";
import { dateKey, fmtDay } from "@/lib/time";
import type { RecurringTask } from "@/lib/types";
import { openComposer } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { nextRuns } from "@/lib/venue-engine";

export function RecurringDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [editing, setEditing] = useState<RecurringTask | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setEditing(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="glass-solid block max-h-[92dvh] overflow-x-hidden overflow-y-auto rounded-3xl p-0 sm:max-w-2xl">
        {editing ? (
          <RecurringForm rule={editing} onDone={() => setEditing(null)} />
        ) : (
          <RecurringList
            onEdit={setEditing}
            onNew={() => {
              onOpenChange(false);
              openComposer({ recurring: true });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecurringList({ onEdit, onNew }: { onEdit: (r: RecurringTask) => void; onNew: () => void }) {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const i = idx(db);
  const today = dateKey(now);
  const rules = db.recurring.filter(
    (r) =>
      !r.deleted_at &&
      (me.role === "owner" || me.role === "ops" || r.department_id === me.department_id || r.created_by === me.id || r.assigned_to === me.id),
  );
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t("Recurring tasks")}</p>
          <DialogTitle className="display mt-1 text-3xl">{t("Tasks that repeat")}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-paper/55">
            {t("Each one goes into the person's queue by itself on its days. To add one, tick “Repeat this task” when deploying a task.")}
          </DialogDescription>
        </div>
        <Btn variant="primary" onClick={onNew}>
          <Plus className="size-4" /> {t("New")}
        </Btn>
      </div>
      <div className="mt-4">
        {rules.length === 0 ? (
          <Empty
            icon={<ClipboardList className="size-6" />}
            title={t("No recurring tasks yet")}
            hint={t("For work that repeats every day, week or month, or on dates you pick: opening checks, deep cleans, stock counts.")}
          />
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => {
              const to = i.userById.get(r.assigned_to);
              const next = nextRuns(r, today);
              return (
                <li key={r.id} className={cn("rounded-2xl border border-white/8 bg-white/[0.03] p-3", !r.active && "opacity-55")}>
                  <div className="flex items-start gap-3">
                    <Avatar user={to} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <RepeatIcon className="size-3.5 shrink-0 text-brand" /> {r.title}
                      </p>
                      <p className="text-xs text-paper/55">
                        {to?.name} · {describeRepeat(r)}
                      </p>
                      <p className="tnum mt-1 text-[11px] text-paper/45">
                        {!r.active
                          ? t("Paused")
                          : next.length
                            ? t("Next: {dates}", { dates: next.map((k) => fmtDay(`${k}T12:00:00Z`)).join(" · ") })
                            : t("No dates left. Edit it to add more.")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <Btn size="sm" variant="subtle" onClick={() => actions.setRecurringActive(r.id, !r.active)}>
                      {r.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {r.active ? t("Pause") : t("Resume")}
                    </Btn>
                    <Btn size="sm" variant="subtle" onClick={() => onEdit(r)}>
                      <Pencil className="size-3.5" /> {t("Edit")}
                    </Btn>
                    <Btn size="sm" variant="subtle" onClick={() => actions.deleteRecurring(r.id)} aria-label={t("Delete")}>
                      <Trash2 className="size-3.5" />
                    </Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
