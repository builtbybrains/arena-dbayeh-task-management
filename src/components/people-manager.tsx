"use client";

// Owner / Operations Manager: add people, give them a role, a department and a
// PIN, change PINs, deactivate people who leave.

import { KeyRound, Pencil, Plus, UserCheck, UserPlus, UserX } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Field } from "@/components/forms";
import { Avatar, Btn, Chip, Empty, Panel } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { canManagePerson } from "@/lib/permissions";
import { actions, useAllVenuesDb, useApp, useDb, useMe, useVenueId } from "@/lib/store";
import { isOpsDept, venueName } from "@/lib/scope";
import { ROLE_LABEL, ROLE_RANK, type Role, type User } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string[]> = {
  christian: ["Security Guard", "Security Supervisor", "Parking Attendant", "Driver"],
  ops: ["Maintenance Technician", "Cleaner", "Cleaning Supervisor", "Security", "Driver"],
  restaurant: ["Waiter", "Cook", "Chef", "Barista", "Cashier", "Kitchen Helper"],
  playground: ["Playground Attendant", "Entry Desk Cashier", "Kids Animator", "Lifeguard", "Party Host"],
};

export function PeopleManager() {
  const db = useDb();
  const me = useMe();
  const sample = useApp((s) => s.mode === "sample");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [underOps, setUnderOps] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const venueId = useVenueId();
  const full = useAllVenuesDb();
  const opsDept = db.departments.find(isOpsDept);

  const groups = useMemo(() => {
    const list = db.users.filter((u) => u.active_status !== showInactive);
    const leaders = list.filter((u) => u.role === "owner" || u.role === "ops");
    // Sections are listed right after the department they sit under.
    const top = db.departments.filter((d) => !d.parent_id).sort((a, b) => a.display_order - b.display_order);
    const ordered = top.flatMap((d) => [d, ...db.departments.filter((x) => x.parent_id === d.id)]);
    for (const d of db.departments) if (!ordered.includes(d)) ordered.push(d);
    return [
      { id: "lead", name: t("Leadership"), parent: null as string | null, users: leaders },
      ...ordered.map((d) => ({
        id: d.id,
        name: t(d.name),
        parent: d.parent_id ? (db.departments.find((x) => x.id === d.parent_id)?.name ?? null) : null,
        users: list
          .filter((u) => u.department_id === d.id && u.role !== "ops")
          .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name)),
      })),
    ];
  }, [db.users, db.departments, showInactive]);

  const missing = [
    !db.users.some((u) => u.role === "ops" && u.active_status) && t("an Operations Manager"),
    ...db.departments
      .filter((d) => !isOpsDept(d) && !d.manager_id)
      .map((d) => t("a manager for {dept}", { dept: t(d.name) })),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {missing.length > 0 && !showInactive && (
        <div className="rounded-2xl border border-warn/40 bg-warn/8 p-4 text-sm text-paper/80">
          <p className="font-semibold text-warn">{t("Still to add")}</p>
          <p className="mt-1">{missing.join(" · ")}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" onClick={() => setEditing("new")}>
          <UserPlus className="size-4" /> {t("Add person")}
        </Btn>
        <Chip active={showInactive} onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? t("Showing people who left") : t("Show people who left")}
        </Chip>
        {(me.role === "owner" || me.role === "ops") && (
          <form
            className="ms-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (actions.addDepartment(newDept, underOps && opsDept ? opsDept.id : null)) setNewDept("");
            }}
          >
            <input className="field h-10 w-44 py-0" placeholder={underOps ? t("New section") : t("New department")} value={newDept} onChange={(e) => setNewDept(e.target.value)} aria-label={t("New department")} />
            {opsDept && (
              <Chip active={underOps} onClick={() => setUnderOps((v) => !v)}>
                {t("Under Operations")}
              </Chip>
            )}
            <Btn type="submit" disabled={newDept.trim().length < 2}>
              <Plus className="size-4" /> {t("Add")}
            </Btn>
          </form>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel
            key={g.id}
            title={
              <span className="flex flex-col">
                {g.name}
                {g.parent && <span className="text-[11px] font-semibold tracking-wider text-paper/45 normal-case">{t("Section under {dept}", { dept: t(g.parent) })}</span>}
              </span>
            }
            right={
              g.id !== "lead" && (me.role === "owner" || me.role === "ops") ? (
                <Btn size="sm" variant="subtle" onClick={() => setRenaming({ id: g.id, name: db.departments.find((d) => d.id === g.id)?.name ?? "" })} aria-label={t("Rename")}>
                  <Pencil className="size-3.5" /> {t("Rename")}
                </Btn>
              ) : undefined
            }
          >
            {g.users.length === 0 ? (
              <Empty
                title={t("No one yet")}
                hint={showInactive ? undefined : opsDept?.id === g.id ? t("The Operations Manager runs this department. Add cleaners, maintenance and drivers here.") : t("Use “Add person” to add someone here.")}
              />
            ) : (
              <ul className="space-y-2">
                {g.users.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
                    <Avatar user={u} size={38} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate font-semibold">
                        {u.name}
                        {u.id === me.id && <span className="ms-1.5 text-xs text-paper/45">({t("you")})</span>}
                      </p>
                      <p className="truncate text-xs text-paper/55">
                        {t(u.title)}
                        {(u.role === "manager" || u.role === "ops") && u.title !== ROLE_LABEL[u.role] ? ` · ${t(ROLE_LABEL[u.role])}` : ""}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </p>
                    </div>
                    {!sample && !u.pin_hash && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn uppercase">{t("No PIN")}</span>}
                    {canManagePerson(me, u) && (
                      <Btn size="sm" variant="subtle" onClick={() => setEditing(u)} aria-label={t("Edit {name}", { name: u.name })}>
                        <Pencil className="size-3.5" />
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="glass-solid block rounded-3xl p-5 sm:max-w-sm">
          <DialogTitle className="display text-2xl">{t("Rename")}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-paper/55">{t("The new name shows everywhere: lists, tasks and reports.")}</DialogDescription>
          {renaming && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (actions.renameDepartment(renaming.id, renaming.name)) setRenaming(null);
              }}
            >
              <input className="field" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} aria-label={t("Name")} autoFocus />
              <Btn variant="primary" type="submit">
                {t("Save")}
              </Btn>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {me.role === "owner" && (
        <p className="text-xs text-paper/45">{t("You are looking at {venue}. People you add here belong to {venue}; switch venue at the top to manage the other team.", { venue: venueName(full, venueId) })}</p>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass-solid block max-h-[92dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-lg">
          {editing && <PersonForm person={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonForm({ person, onDone }: { person: User | null; onDone: () => void }) {
  const db = useDb();
  const me = useMe();
  const sample = useApp((s) => s.mode === "sample");
  const roles: Role[] = (["owner", "ops", "manager", "employee"] as Role[]).filter((r) => (me.role === "owner" ? true : ROLE_RANK[r] > ROLE_RANK[me.role]));
  const hasOps = db.users.some((u) => u.role === "ops" && u.active_status && u.id !== person?.id);
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState<Role>(person?.role ?? (hasOps || me.role !== "owner" ? "employee" : "ops"));
  const [dept, setDept] = useState(person?.department_id ?? db.departments.find((d) => !isOpsDept(d))?.id ?? db.departments[0]?.id ?? "");
  const [title, setTitle] = useState(person?.title ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = person?.role === "owner";
  const depts = db.departments.filter((d) => role !== "manager" || !isOpsDept(d));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await actions.savePerson({
      id: person?.id,
      name,
      role,
      title,
      department_id: role === "ops" || role === "owner" ? null : dept,
      restaurant_id: dept === "restaurant" && role === "employee" && /waiter/i.test(title) ? (db.restaurants[0]?.id ?? null) : null,
      phone,
      pin: pin || undefined,
    });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="p-5 pb-0">
        <p className="eyebrow">{person ? t("Edit person") : t("New person")}</p>
        <DialogTitle className="display mt-1 text-3xl">{person ? person.name : t("Add someone to the team")}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm text-paper/55">
          {t("They sign in on their own phone by tapping their name and typing this PIN.")}
        </DialogDescription>
      </div>
      <div className="space-y-4 p-5">
        <Field label={t("Full name")} htmlFor="p-name">
          <input id="p-name" className="field text-base font-semibold" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </Field>
        {!isOwner && (
          <Field label={t("Position")}>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <Chip key={r} active={role === r} onClick={() => setRole(r)} disabled={(r === "ops" && hasOps) || (r === "owner" && !!person)}>
                  {t(ROLE_LABEL[r])}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        {(role === "manager" || role === "employee") && (
          <Field label={t("Department")}>
            <div className="flex flex-wrap gap-1.5">
              {depts.map((d) => (
                <Chip key={d.id} active={dept === d.id} onClick={() => setDept(d.id)}>
                  {t(d.name)}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label={t("Job title")} htmlFor="p-title">
          <input
            id="p-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={role === "manager" ? t("e.g. Playground Manager") : role === "ops" ? t("Operations Manager") : t("e.g. Waiter")}
          />
          {role === "employee" && (TITLES[dept] ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(TITLES[dept] ?? []).map((x) => (
                <Chip key={x} active={title === x} onClick={() => setTitle(x)}>
                  {t(x)}
                </Chip>
              ))}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Phone (optional)")} htmlFor="p-phone">
            <input id="p-phone" className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {!sample && (
            <Field label={person ? t("New PIN (optional)") : t("4-digit PIN")} htmlFor="p-pin">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-paper/40" />
                <input
                  id="p-pin"
                  className="field tnum ps-9 tracking-[0.4em]"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  required={!person}
                  placeholder={person ? "••••" : ""}
                />
              </div>
            </Field>
          )}
        </div>
        {!sample && !person && <p className="text-xs text-paper/50">{t("Write the PIN down for them, or let them type it in themselves.")}</p>}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0b0f0d] p-4">
        {person && !isOwner && person.id !== me.id && (
          <Btn
            variant={person.active_status ? "danger" : "ghost"}
            onClick={() => {
              if (actions.setPersonActive(person.id, !person.active_status)) onDone();
            }}
          >
            {person.active_status ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
            {person.active_status ? t("Deactivate") : t("Reactivate")}
          </Btn>
        )}
        <div className={cn("ms-auto flex gap-2")}>
          <Btn onClick={onDone}>{t("Cancel")}</Btn>
          <Btn variant="primary" type="submit" disabled={busy || name.trim().length < 2 || (!person && !sample && pin.length !== 4)}>
            {person ? t("Save") : t("Add person")}
          </Btn>
        </div>
      </div>
    </form>
  );
}
