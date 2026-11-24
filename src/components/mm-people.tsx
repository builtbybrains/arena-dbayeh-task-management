"use client";

// Money Mondo: add people, give them one or more jobs and a PIN, take them out.
// Owners can also bring someone who already works at Arena (same PIN).

import { KeyRound, Pencil, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Field } from "@/components/forms";
import { Avatar, Btn, Chip, Empty, Panel } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inArena, jobsOf, jobTitle, MM_JOB_LABEL, MM_JOBS, MM_TEAMS } from "@/lib/business";
import { t } from "@/lib/i18n";
import { canManagePeople, canManagePerson, grantableJobs, inDept } from "@/lib/permissions";
import { actions, useApp, useDb, useFullDb, useMe } from "@/lib/store";
import type { MmJob, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const JOB_HINT: Record<MmJob, string> = {
  mall_manager: "Runs all of Money Mondo",
  omt_manager: "Runs the OMT Operators",
  omt: "OMT counter and transfers",
  sales: "Selling at the mall",
  collector: "Cash pickups and hand-overs",
  group: "Group members and payouts",
  bb: "",
};

export function MmPeopleManager() {
  const db = useDb();
  const full = useFullDb();
  const me = useMe();
  const sample = useApp((s) => s.mode === "sample");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const fullById = useMemo(() => new Map(full.users.map((u) => [u.id, u])), [full.users]);

  const groups = useMemo(() => {
    const list = db.users.filter((u) => u.active_status !== showInactive);
    const byName = (a: User, b: User) => a.name.localeCompare(b.name);
    if (showInactive) return [{ id: "left", name: t("People who left Money Mondo"), users: list.sort(byName) }];
    return [
      { id: "lead", name: t("Owners and Mall Manager"), users: list.filter((u) => u.role === "owner" || u.role === "ops").sort(byName) },
      ...MM_TEAMS.map((d) => ({
        id: d.id,
        name: t(d.name),
        users: list
          .filter((u) => u.role !== "owner" && u.role !== "ops" && inDept(u, d.id))
          .sort((a, b) => Number(b.role === "manager") - Number(a.role === "manager") || byName(a, b)),
      })),
    ];
  }, [db.users, showInactive]);

  const has = (job: MmJob) => full.users.some((u) => u.active_status && u.mm_jobs?.includes(job));
  const missing = [!has("mall_manager") && t("a Mall Manager"), !has("omt_manager") && t("an OMT Manager")].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {missing.length > 0 && !showInactive && (
        <div className="rounded-2xl border border-warn/40 bg-warn/8 p-4 text-sm text-paper/80">
          <p className="font-semibold text-warn">{t("Still to add")}</p>
          <p className="mt-1">{missing.join(" · ")}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canManagePeople(me) && (
          <Btn variant="primary" onClick={() => setEditing("new")}>
            <UserPlus className="size-4" /> {t("Add person")}
          </Btn>
        )}
        <Chip active={showInactive} onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? t("Showing people who left") : t("Show people who left")}
        </Chip>
        <p className="ms-auto text-xs text-paper/50">{t("A person can have several jobs. They show in each team.")}</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.id} title={g.name}>
            {g.users.length === 0 ? (
              <Empty title={t("No one yet")} hint={showInactive ? undefined : t("Use “Add person” to add someone here.")} />
            ) : (
              <ul className="space-y-2">
                {g.users.map((u) => {
                  const raw = fullById.get(u.id);
                  const by = raw?.created_by ? fullById.get(raw.created_by) : undefined;
                  return (
                    <li key={u.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
                      <Avatar user={u} size={38} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate font-semibold">
                          {u.name}
                          {u.id === me.id && <span className="ms-1.5 text-xs text-paper/45">({t("you")})</span>}
                        </p>
                        <p className="truncate text-xs text-paper/55">
                          {u.role === "owner" ? t("Owner") : t(jobTitle(jobsOf(u))) || t("No job")}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </p>
                        {(raw && u.role !== "owner" && inArena(raw) && raw.active_status) || by ? (
                          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-paper/40">
                            {raw && u.role !== "owner" && inArena(raw) && raw.active_status && <span className="font-semibold text-brand/80">{t("Also at Arena")}</span>}
                            {by && <span>{t("Added by {name}", { name: by.name })}</span>}
                          </p>
                        ) : null}
                      </div>
                      {!sample && !u.pin_hash && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn uppercase">{t("No PIN")}</span>}
                      {u.role !== "owner" && canManagePerson(me, u) && (
                        <Btn size="sm" variant="subtle" onClick={() => setEditing(u)} aria-label={t("Edit {name}", { name: u.name })}>
                          <Pencil className="size-3.5" />
                        </Btn>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass-solid block max-h-[92dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-lg">
          {editing && <MmPersonForm person={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MmPersonForm({ person, onDone }: { person: User | null; onDone: () => void }) {
  const full = useFullDb();
  const me = useMe();
  const sample = useApp((s) => s.mode === "sample");
  const grantable = new Set(grantableJobs(me));
  // Owners can bring in someone who already works at Arena; they keep their PIN.
  const arenaPeople = useMemo(
    () =>
      me.role === "owner" && !person
        ? full.users.filter((u) => u.active_status && u.role !== "owner" && inArena(u) && !(u.mm_jobs?.length)).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [full.users, me.role, person],
  );
  const [linkId, setLinkId] = useState("");
  const linked = arenaPeople.find((u) => u.id === linkId) ?? null;
  const [name, setName] = useState(person?.name ?? "");
  const [jobs, setJobs] = useState<MmJob[]>(person ? jobsOf(person) : []);
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const taken = (job: MmJob) => full.users.some((u) => u.id !== person?.id && u.active_status && u.mm_jobs?.includes(job));
  const toggle = (job: MmJob) =>
    setJobs((cur) => {
      if (cur.includes(job)) return cur.filter((j) => j !== job);
      const other: MmJob | null = job === "mall_manager" ? "omt_manager" : job === "omt_manager" ? "mall_manager" : null;
      return [...cur.filter((j) => j !== other), job];
    });
  const needsPin = !person && !linked && !sample;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await actions.saveMmPerson({
      id: person?.id ?? linked?.id,
      name: linked ? linked.name : name,
      jobs,
      phone: linked ? linked.phone : phone,
      pin: pin || undefined,
    });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="p-5 pb-0">
        <p className="eyebrow">Money Mondo · {person ? t("Edit person") : t("New person")}</p>
        <DialogTitle className="display mt-1 text-3xl">{person ? person.name : t("Add someone to the team")}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm text-paper/55">
          {t("They sign in on their own phone by tapping their name and typing this PIN.")}
        </DialogDescription>
      </div>
      <div className="space-y-4 p-5">
        {arenaPeople.length > 0 && (
          <Field label={t("Someone from Arena")} htmlFor="mm-link" hint={t("They keep their Arena position and PIN, and switch between the two.")}>
            <select id="mm-link" className="field" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">{t("No, a new person")}</option>
              {arenaPeople.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {t(u.title)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!linked && (
          <Field label={t("Full name")} htmlFor="mm-name">
            <input id="mm-name" className="field text-base font-semibold" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </Field>
        )}
        <Field label={t("Jobs")} hint={t("Pick every job this person does.")}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MM_JOBS.filter((j) => grantable.has(j) || jobs.includes(j)).map((j) => {
              const on = jobs.includes(j);
              const off = !grantable.has(j) || (!on && (j === "mall_manager" || j === "omt_manager") && taken(j));
              return (
                <button
                  key={j}
                  type="button"
                  aria-pressed={on}
                  disabled={off}
                  onClick={() => toggle(j)}
                  className={cn(
                    "rounded-2xl border p-2.5 text-start transition disabled:opacity-40",
                    on ? "border-brand/70 bg-brand/12" : "border-white/10 bg-white/[0.03] hover:border-white/25",
                  )}
                >
                  <span className={cn("block text-sm font-semibold", on && "text-brand-soft")}>{t(MM_JOB_LABEL[j])}</span>
                  {(JOB_HINT[j] || taken(j)) && (
                    <span className="block text-[11px] text-paper/50">
                      {!on && (j === "mall_manager" || j === "omt_manager") && taken(j) ? t("Already taken") : t(JOB_HINT[j])}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Field>
        {!linked && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Phone (optional)")} htmlFor="mm-phone">
              <input id="mm-phone" className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            {!sample && (
              <Field label={person ? t("New PIN (optional)") : t("4-digit PIN")} htmlFor="mm-pin">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-paper/40" />
                  <input
                    id="mm-pin"
                    className="field tnum ps-9 tracking-[0.4em]"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    required={needsPin}
                    placeholder={person ? "••••" : ""}
                  />
                </div>
              </Field>
            )}
          </div>
        )}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0b0f0d] p-4">
        {person && person.active_status && person.id !== me.id && (
          <Btn
            variant="danger"
            onClick={() => {
              if (actions.removeFromMm(person.id)) onDone();
            }}
          >
            <UserMinus className="size-4" /> {t("Remove from Money Mondo")}
          </Btn>
        )}
        <div className="ms-auto flex gap-2">
          <Btn onClick={onDone}>{t("Cancel")}</Btn>
          <Btn
            variant="primary"
            type="submit"
            disabled={busy || jobs.length === 0 || (!linked && name.trim().length < 2) || (needsPin && pin.length !== 4)}
          >
            {person ? (person.active_status ? t("Save") : t("Bring back")) : t("Add person")}
          </Btn>
        </div>
      </div>
    </form>
  );
}
