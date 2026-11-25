"use client";

import { Building2, Check, Cloud, Info, Languages, LogOut, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstagramPanel } from "@/components/instagram-panel";
import { Btn, PageHeader, Panel, Segmented } from "@/components/kit";
import { setLang, t, useLang } from "@/lib/i18n";
import { canEraseWorkspace, ROLE_PERMISSIONS } from "@/lib/permissions";
import { useSync } from "@/lib/repository";
import { actions, eraseWorkspace, leaveMode, resetDemo, setEffects, useApp, useDb, useMe } from "@/lib/store";
import { fmtDay, fmtTime } from "@/lib/time";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { openDemo } from "@/lib/ui";

const ROLES: Role[] = ["owner", "ops", "manager", "employee"];

export default function SettingsPage() {
  const db = useDb();
  const me = useMe();
  const router = useRouter();
  const mode = useApp((s) => s.mode);
  const effects = useApp((s) => s.effects);
  const lang = useLang((s) => s.lang);
  const sync = useSync();
  const [confirm, setConfirm] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [venue, setVenue] = useState(db.workspace?.name ?? "");
  const sample = mode === "sample";
  const people = db.users.filter((u) => u.active_status).length;

  return (
    <>
      <PageHeader eyebrow={t("Settings")} title={sample ? t("Sample data settings") : t("Workspace settings")} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {sample ? (
          <Panel title={t("Sample data")} icon={<Info className="size-5" />}>
            <p className="text-sm leading-relaxed text-paper/70">
              {t("You are looking at fictional sample data created on {date} at {time}. It is saved in this browser only, and fresh sample data is generated each day.", {
                date: fmtDay(db.seeded_at),
                time: fmtTime(db.seeded_at),
              })}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Btn onClick={openDemo}>
                <Users className="size-4" /> {t("Switch profile")}
              </Btn>
              {confirm ? (
                <>
                  <Btn
                    variant="danger"
                    onClick={() => {
                      resetDemo();
                      setConfirm(false);
                    }}
                  >
                    {t("Yes, reset everything")}
                  </Btn>
                  <Btn variant="subtle" onClick={() => setConfirm(false)}>
                    {t("Cancel")}
                  </Btn>
                </>
              ) : (
                <Btn variant="danger" onClick={() => setConfirm(true)}>
                  <RotateCcw className="size-4" /> {t("Reset demo")}
                </Btn>
              )}
              <Btn
                variant="subtle"
                onClick={() => {
                  leaveMode();
                  router.push("/");
                }}
              >
                <LogOut className="size-4" /> {t("Leave sample data")}
              </Btn>
            </div>
          </Panel>
        ) : (
          <Panel title={t("Workspace")} icon={<Building2 className="size-5" />}>
            <ul className="space-y-1.5 text-sm text-paper/70">
              <li>{t("{n} active people across {d} departments", { n: people, d: db.departments.length })}</li>
              <li>{t("{n} tasks, {e} events, {w} walk-ins recorded", { n: db.tasks.filter((x) => !x.deleted_at).length, e: db.events.filter((e) => !e.deleted_at).length, w: db.walkins.filter((w) => !w.deleted_at).length })}</li>
              <li className="flex items-center gap-1.5">
                <Cloud className="size-4 text-brand" />
                {sync.status === "offline" ? t("Offline: changes will send when the connection is back.") : t("Saved online and shared with every phone.")}
              </li>
            </ul>
            {(me.role === "owner" || me.role === "ops") && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  actions.updateWorkspace({ name: venue });
                }}
              >
                <input className="field" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label={t("Venue name")} />
                <Btn type="submit">{t("Save")}</Btn>
              </form>
            )}
          </Panel>
        )}

        {(me.role === "owner" || me.role === "ops") && <InstagramPanel />}

        <Panel title={t("Language")} icon={<Languages className="size-5" />}>
          <Segmented
            id="lang"
            value={lang}
            onChange={setLang}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
          <p className="mt-3 text-xs text-paper/50">{t("Each phone keeps its own language.")}</p>
        </Panel>

        <Panel title={t("Visual effects")} icon={<Sparkles className="size-5" />}>
          <p className="text-sm leading-relaxed text-paper/70">
            {t("The 3D operations map loads only on larger screens and switches to a flat map automatically when the device asks for reduced motion.")}
          </p>
          <Segmented
            id="effects"
            className="mt-4"
            value={effects}
            onChange={setEffects}
            options={[
              { value: "auto", label: t("3D when available") },
              { value: "off", label: t("Flat map only") },
            ]}
          />
        </Panel>

        {!sample && canEraseWorkspace(me) && (
          <Panel title={t("Start over")} icon={<TriangleAlert className="size-5" />}>
            <p className="text-sm leading-relaxed text-paper/70">
              {t("Erase every person, task, event and walk-in for everyone, and set the workspace up again. This cannot be undone.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="field max-w-[200px]" placeholder={t("Type ERASE")} value={eraseText} onChange={(e) => setEraseText(e.target.value)} aria-label={t("Type ERASE to confirm")} />
              <Btn
                variant="danger"
                disabled={eraseText.trim().toUpperCase() !== "ERASE"}
                onClick={async () => {
                  if (await eraseWorkspace()) router.push("/");
                }}
              >
                {t("Erase workspace")}
              </Btn>
            </div>
          </Panel>
        )}

        <Panel title={t("Access by position")} icon={<ShieldCheck className="size-5" />} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <p className="font-display text-lg font-bold tracking-wide uppercase">{t(ROLE_LABEL[r])}</p>
                <ul className="mt-2.5 space-y-2">
                  {ROLE_PERMISSIONS[r].map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs leading-snug text-paper/70">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> {t(p)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-paper/45">
            {t("These rules apply to every screen and every action. During this trial the data is shared through a simple online store; moving to a full backend later adds server-side checks.")}
          </p>
        </Panel>
      </div>
      <p className="mt-8 text-center text-xs text-paper/35">{t("Arena OS · built for Arena Dbayeh by Brains AI Solutions")}</p>
    </>
  );
}
