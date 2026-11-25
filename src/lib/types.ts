// Logical entities for Arena OS. Field names follow the database naming in the
// implementation plan (snake_case) so the local demo store maps 1:1 onto
// Supabase tables later. All timestamps are ISO-8601 strings in UTC.

/**
 * Chain of command at Arena: the Owner, then the Operations Manager (runs the
 * whole venue), then department managers (Restaurant, Playground), then staff.
 */
export type Role = "owner" | "ops" | "manager" | "employee";
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "paused" | "completed";

export interface User {
  id: string;
  name: string;
  role: Role;
  title: string;
  department_id: string | null;
  manager_id: string | null;
  restaurant_id: string | null; // waiters belong to one restaurant
  avatar: string; // hue (0-360) used to draw the initials avatar
  active_status: boolean;
  pin_hash: string | null; // SHA-256 of the 4-digit PIN; null in sample mode
  phone?: string | null;
  venue_id?: string | null; // Arena or Money Mondo; Owners have none (they see every venue). Missing = Arena.
  created_by?: string | null; // who added this account
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  short: string;
  manager_id: string | null; // null until the Owner adds its manager
  description: string;
  display_order: number;
  venue_id?: string; // missing = Arena
  is_ops?: boolean; // the venue's Operations department, run by its Operations Manager
  parent_id?: string | null; // a section that sits under another department (e.g. under Operations)
}

/** A business the Owners run: Arena, Money Mondo. Each has its own team and numbers. */
export interface Venue {
  id: string;
  name: string;
  display_order: number;
  walkin_price_kid?: number;
  walkin_price_adult?: number;
}

/** A restaurant outlet inside the restaurants department, with its own waiters. */
export interface Restaurant {
  id: string;
  name: string;
  department_id: string;
  description: string;
  display_order: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  department_id: string;
  assigned_by: string;
  assigned_to: string | null;
  priority: Priority;
  status: TaskStatus;
  due_at: string;
  estimated_duration: number | null; // time allowed, in minutes; running past it raises an alert
  category: string | null;
  internal_notes: string | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  display_order: number | null; // manual rank inside a priority level
  deleted_at: string | null; // soft delete keeps historical reports intact
  event_id?: string | null; // prep / cleanup work for a booked event
  recurring_id?: string | null; // created by a recurring schedule
}

export interface TaskTimeSession {
  id: string;
  task_id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null; // null while the timer is running
  duration_seconds: number;
}

export type ActivityAction =
  | "assigned"
  | "started"
  | "paused"
  | "resumed"
  | "completed"
  | "reopened"
  | "reassigned"
  | "priority_changed"
  | "edited"
  | "overdue"
  | "over_time"
  | "removed"
  | "escalated"
  | "report_submitted"
  | "event_created"
  | "event_updated"
  | "event_cancelled";

export interface TaskActivityLog {
  id: string;
  task_id: string | null;
  actor_id: string;
  action: ActivityAction;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface EmployeeReportRow {
  user_id: string;
  name: string;
  title: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  delayed: number;
  active_seconds: number;
  avg_seconds: number;
  completion_rate: number;
}

export interface DepartmentTotals {
  department_id: string;
  department_name: string;
  from: string; // business date
  to: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  delayed: number;
  completion_rate: number;
  active_seconds: number;
  avg_seconds: number;
}

export interface DepartmentSnapshot extends DepartmentTotals {
  employees: EmployeeReportRow[];
  follow_up: { task_id: string; title: string; reason: string }[];
}

export interface DailyReport {
  id: string;
  report_date: string; // Asia/Beirut business date, YYYY-MM-DD
  department_id: string;
  submitted_by: string;
  submitted_at: string;
  status: "submitted" | "reviewed";
  generated_snapshot: DepartmentSnapshot;
  manager_notes: string;
}

export interface ExecutiveSnapshot {
  date: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completion_rate: number;
  active_seconds: number;
  departments: DepartmentTotals[];
  overdue_critical: { task_id: string; title: string; department_name: string }[];
  missing_departments: string[];
}

export interface ExecutiveReport {
  id: string;
  venue_id?: string; // missing = Arena
  report_date: string;
  submitted_by: string;
  submitted_at: string;
  department_report_ids: string[];
  generated_snapshot: ExecutiveSnapshot;
  executive_notes: string;
}

// --- Venue: events, walk-ins, revenue ---------------------------------------

export type EventKind = "birthday" | "private" | "school" | "corporate" | "tournament" | "other";
export type EventStatus = "booked" | "confirmed" | "done" | "cancelled";
export type Area = "playground" | "restaurant" | "sports" | "whole_venue" | "other";

export interface VenueEvent {
  id: string;
  title: string;
  kind: EventKind;
  status: EventStatus;
  starts_at: string; // UTC
  ends_at: string; // UTC
  area: Area;
  kids: number;
  adults: number;
  contact_name: string;
  contact_phone: string;
  package_price: number; // USD, what the client pays for the package
  deposit: number; // USD already paid
  notes: string;
  owner_id: string | null; // person in charge on the day
  venue_id?: string; // missing = Arena
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WalkIn {
  id: string;
  at: string; // UTC time of arrival
  kids: number;
  adults: number;
  area: Area;
  amount: number; // USD collected at the door (0 if free)
  note: string;
  logged_by: string;
  deleted_at: string | null;
  venue_id?: string; // missing = Arena
}

/** Revenue typed in by a manager for one business day and one source. */
export interface RevenueEntry {
  id: string; // `${date}_${source}` for Arena, `${venue}_${date}_${source}` elsewhere: one figure per day and source
  date: string; // Beirut business date
  venue_id?: string; // missing = Arena
  source: "restaurant" | "other"; // door money and event packages are counted from walk-ins and events
  amount: number; // USD
  note: string;
  entered_by: string;
  updated_at: string;
}

// --- Reminders and recurring tasks ------------------------------------------

export interface Reminder {
  id: string;
  title: string;
  note: string;
  at: string; // UTC moment it fires
  for_user_ids: string[]; // who gets it
  created_by: string;
  event_id: string | null;
  done_by: string[]; // people who dismissed it
  created_at: string;
  deleted_at: string | null;
  link?: string | null; // e.g. the Instagram post to open
}

/** Which Instagram page to watch and who hears about new posts (see worker/instagram.js). */
export interface InstagramWatch {
  username: string;
  enabled: boolean;
  recipients: string[]; // user ids who get an alert
  task_to: string | null; // optional: also give this person a "like and repost" task
  set_by: string;
  updated_at: string;
}

export type Repeat = "daily" | "weekly" | "monthly";

/** A task that creates itself on a schedule (e.g. the daily opening checklist). */
export interface RecurringTask {
  id: string;
  title: string;
  description: string;
  department_id: string;
  assigned_to: string;
  priority: Priority;
  repeat: Repeat;
  weekdays: number[]; // 0 = Sunday … 6 = Saturday, for weekly
  month_day: number; // 1-28, for monthly
  due_time: string; // "HH:MM" Beirut
  estimated_duration: number; // minutes
  active: boolean;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
}

/** Workspace-wide facts: name, currency, who set it up. */
export interface Workspace {
  id: "workspace";
  name: string;
  created_at: string;
  created_by: string;
  walkin_price_kid: number;
  walkin_price_adult: number;
}

export interface Database {
  version: number;
  seeded_at: string;
  /** Set on a venue's slice of the data (see scope.ts); never stored. */
  scope_venue?: string;
  workspace: Workspace | null;
  instagram?: InstagramWatch | null;
  venues: Venue[];
  users: User[];
  departments: Department[];
  restaurants: Restaurant[];
  tasks: Task[];
  sessions: TaskTimeSession[];
  logs: TaskActivityLog[];
  daily_reports: DailyReport[];
  executive_reports: ExecutiveReport[];
  events: VenueEvent[];
  walkins: WalkIn[];
  revenue: RevenueEntry[];
  reminders: Reminder[];
  recurring: RecurringTask[];
}

/** The record collections that sync, in the order they load. */
export const COLLECTIONS = [
  "venues",
  "users",
  "departments",
  "restaurants",
  "tasks",
  "sessions",
  "logs",
  "daily_reports",
  "executive_reports",
  "events",
  "walkins",
  "revenue",
  "reminders",
  "recurring",
] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  birthday: "Birthday",
  private: "Private party",
  school: "School trip",
  corporate: "Corporate",
  tournament: "Tournament",
  other: "Other",
};
export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  birthday: "#ff7ac6",
  private: "#a98bff",
  school: "#5aa9ff",
  corporate: "#ffc24b",
  tournament: "#22c73f",
  other: "#8b958f",
};
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  done: "Done",
  cancelled: "Cancelled",
};
export const AREA_LABEL: Record<Area, string> = {
  playground: "Playground",
  restaurant: "Restaurant",
  sports: "Sports courts",
  whole_venue: "Whole venue",
  other: "Other",
};
export const REVENUE_SOURCE_LABEL: Record<RevenueEntry["source"], string> = {
  restaurant: "Restaurant sales",
  other: "Other income",
};

export const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#ff4d5e",
  high: "#ffa53c",
  medium: "#5aa9ff",
  low: "#8b958f",
};
export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
};
/** Position in the chain of command; a lower number is higher up. */
export const ROLE_RANK: Record<Role, number> = { owner: 0, ops: 1, manager: 2, employee: 3 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  ops: "Operations Manager",
  manager: "Department Manager",
  employee: "Staff",
};
