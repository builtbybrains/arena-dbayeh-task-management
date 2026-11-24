// Central permissions layer. Every screen and every store action goes through
// these helpers, so hiding a button is never the only protection. In production
// the same rules belong in Supabase row-level security.

import type { Database, Role, Task, User, WalkIn } from "./types";
import { ROLE_RANK } from "./types";

export const isExec = (u: User) => u.role === "owner";
export const isCompanyWide = (u: User) => u.role === "owner" || u.role === "ops";

/**
 * Chain of command: Owner > Operations Manager > Department Manager (Restaurant,
 * Playground) > Staff. A department manager's chain is their own department.
 */
export function isBeneath(actor: User, target: User): boolean {
  if (ROLE_RANK[target.role] <= ROLE_RANK[actor.role]) return false;
  return actor.role !== "manager" || target.department_id === actor.department_id;
}

export function visibleDepartmentIds(db: Database, u: User): string[] {
  if (isCompanyWide(u)) return db.departments.map((d) => d.id);
  return u.department_id ? [u.department_id] : [];
}

export function canViewDepartment(u: User, deptId: string): boolean {
  return isCompanyWide(u) || (u.role === "manager" && u.department_id === deptId);
}

export function canViewTask(u: User, t: Task): boolean {
  if (t.deleted_at) return false;
  if (isCompanyWide(u)) return true;
  if (u.role === "manager") return t.department_id === u.department_id || t.assigned_to === u.id;
  return t.assigned_to === u.id;
}

/** Whether `viewer` may see `target`'s tasks, activity and performance. */
export function canViewUser(viewer: User, target: User): boolean {
  if (viewer.id === target.id || isCompanyWide(viewer)) return true;
  return viewer.role === "manager" && target.role === "employee" && target.department_id === viewer.department_id;
}

export const canCreateTasks = (u: User) => u.role !== "employee";

export function assignableDepartmentIds(db: Database, actor: User): string[] {
  if (actor.role === "employee") return [];
  if (actor.role === "manager") return actor.department_id ? [actor.department_id] : [];
  return db.departments.map((d) => d.id);
}

/**
 * Who `actor` may assign a task to inside a department: everyone beneath them
 * in the chain of command. The Owner usually hands work to the Operations
 * Manager (who sits above the departments and appears in every one) but can
 * also assign straight to anyone.
 */
export function assignableUsers(db: Database, actor: User, deptId: string): User[] {
  if (actor.role === "manager" && actor.department_id !== deptId) return [];
  return db.users.filter(
    (u) => u.active_status && isBeneath(actor, u) && (u.department_id === deptId || u.department_id === null),
  );
}

export function canAssign(db: Database, actor: User, assigneeId: string, deptId: string): boolean {
  return assignableUsers(db, actor, deptId).some((u) => u.id === assigneeId);
}

/**
 * Edit, reassign, reprioritise, reorder, reopen or remove a task. Allowed when
 * the task sits with someone beneath the actor (or with no one yet); never for
 * a task assigned to the actor themselves or to someone above them.
 */
export function canManageTask(db: Database, actor: User, t: Task): boolean {
  if (t.deleted_at || actor.role === "employee" || t.assigned_to === actor.id) return false;
  if (actor.role === "manager" && t.department_id !== actor.department_id) return false;
  if (!t.assigned_to) return true;
  const assignee = db.users.find((u) => u.id === t.assigned_to);
  return assignee ? isBeneath(actor, assignee) : true;
}

/**
 * Pass a task on: a manager who received a task (the Operations Manager from
 * the Owner, a department manager from Ops) hands it to someone beneath them.
 */
export const canDelegate = (actor: User, t: Task) =>
  !t.deleted_at && actor.role !== "employee" && t.assigned_to === actor.id && t.status !== "completed";

/** Who a task can be passed on to: anyone beneath the person holding it. */
export function delegateTargets(db: Database, actor: User): User[] {
  return db.users.filter((u) => u.active_status && isBeneath(actor, u));
}

export const canRunTimer = (actor: User, t: Task) => !t.deleted_at && t.assigned_to === actor.id;
export const canEscalate = (actor: User, t: Task) =>
  actor.role === "manager" && t.department_id === actor.department_id && t.status !== "completed";
export const canSeeInternalNotes = (actor: User) => actor.role !== "employee";
export const canSubmitDepartmentReport = (actor: User, deptId: string) =>
  (actor.role === "manager" && actor.department_id === deptId) ||
  (actor.role === "ops" && deptId === "ops");
export const canSubmitExecutiveReport = (actor: User) => actor.role === "ops";
export const canViewReports = (actor: User) => actor.role !== "employee";

// --- Venue ---------------------------------------------------------------------
export const canManageEvents = (actor: User) => actor.role !== "employee";
export const canLogWalkIn = (actor: User) => actor.active_status;
/** Fix or remove a walk-in: managers, or the person who logged it within the hour. */
export const canEditWalkIn = (actor: User, w: WalkIn, now: number) =>
  actor.role !== "employee" || (w.logged_by === actor.id && now - Date.parse(w.at) < 60 * 60 * 1000);
export const canEnterRevenue = (actor: User) => actor.role !== "employee";
export const canSeeRevenue = (actor: User) => actor.role === "owner" || actor.role === "ops";
export const canManageRecurring = (actor: User) => actor.role !== "employee";
/** Add people, set PINs, change roles: the Owner for everyone, Ops for everyone below. */
export function canManagePerson(actor: User, target: User | null): boolean {
  if (actor.role === "owner") return true;
  if (actor.role !== "ops") return false;
  return !target || ROLE_RANK[target.role] > ROLE_RANK.ops;
}
export const canManagePeople = (actor: User) => actor.role === "owner" || actor.role === "ops";
export const canEraseWorkspace = (actor: User) => actor.role === "owner";

/** People a reminder can be sent to: yourself and anyone beneath you. */
export function remindableUsers(db: Database, actor: User): User[] {
  return db.users.filter((u) => u.active_status && (u.id === actor.id || isBeneath(actor, u)));
}

export interface NavItem {
  href: string;
  label: string;
  /** Shown in the phone's bottom bar; the rest sit behind "More". */
  mobile?: boolean;
  icon:
    | "radar"
    | "tasks"
    | "rocket"
    | "send"
    | "network"
    | "users"
    | "reports"
    | "settings"
    | "sun"
    | "target"
    | "trend"
    | "user"
    | "building"
    | "calendar"
    | "door";
}

const TOP_NAV: NavItem[] = [
  { href: "/command", label: "Command Center", icon: "radar", mobile: true },
  { href: "/tasks", label: "All Tasks", icon: "tasks", mobile: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
  { href: "/walk-ins", label: "Walk-ins", icon: "door", mobile: true },
  { href: "/departments", label: "Departments", icon: "network" },
  { href: "/team", label: "Team", icon: "users" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const NAV: Record<Role, NavItem[]> = {
  owner: TOP_NAV,
  ops: TOP_NAV,
  manager: [
    { href: "/department", label: "My Department", icon: "building", mobile: true },
    { href: "/tasks", label: "Assign Tasks", icon: "send", mobile: true },
    { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
    { href: "/walk-ins", label: "Walk-ins", icon: "door", mobile: true },
    { href: "/team", label: "Team", icon: "users" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  employee: [
    { href: "/my-day", label: "My Day", icon: "sun", mobile: true },
    { href: "/my-tasks", label: "My Tasks", icon: "target", mobile: true },
    { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
    { href: "/walk-ins", label: "Walk-ins", icon: "door", mobile: true },
    { href: "/my-progress", label: "My Progress", icon: "trend" },
    { href: "/profile", label: "Profile", icon: "user" },
  ],
};

/** Navigation for a person. Restaurants and their waiters live inside Departments. */
export const navFor = (u: User): NavItem[] => NAV[u.role];

export const homeFor = (role: Role) => NAV[role][0].href;

export function canAccessRoute(u: User, path: string): boolean {
  return navFor(u).some((n) => path === n.href || path.startsWith(`${n.href}/`));
}

/** Plain-language permission summary shown on the role selector and profile. */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: [
    "Sees everything: tasks, events, walk-ins and revenue",
    "Assigns to the Operations Manager, or anyone directly",
    "Adds people, sets their PINs and reviews all reports",
  ],
  ops: [
    "Runs daily operations across the whole venue",
    "Passes tasks on to managers and staff",
    "Books events and submits the daily report to the Owner",
  ],
  manager: [
    "Sees only their own department",
    "Assigns tasks and time limits to their team",
    "Books events and submits the daily department report",
  ],
  employee: [
    "Sees only their own tasks",
    "Starts, pauses and completes tasks",
    "Logs walk-ins and sees the event calendar",
  ],
};
