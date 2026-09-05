// Shared, framework-agnostic constants + types for Task Boards.
// Safe to import from server and client components (no server-only deps).
// Data lives in company_os.boards / board_columns / board_members / sprints /
// tasks / task_stage_log. Admin manages boards; team members see boards they
// belong to; a client sees the board linked to their company (read-only).

export const TASK_PRIORITIES = ["p1", "p2", "p3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

// Tone maps onto the shared <Badge> component (ok/warn/err/info/neutral).
export const PRIORITY_TONE: Record<TaskPriority, "err" | "warn" | "neutral"> = {
  p1: "err",
  p2: "warn",
  p3: "neutral",
};

export const TASK_STATUSES = ["open", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const BOARD_STATUSES = ["active", "archived"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const SPRINT_STATUSES = ["active", "closed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const EPIC_STATUSES = ["active", "archived"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];

// Epic accent colors: the fixed on-palette set (values mirror lib/admin/stageColors,
// the single source for board accents). New epics cycle through these by sort
// order; the manage drawer can recolor. A null epics.color falls back to the first.
export const EPIC_COLORS = [
  "var(--admin-accent)", // brand blue
  "var(--admin-ok-strong)", // green
  "var(--admin-chart-4)", // near-black (was pink)
  "var(--admin-warn-strong)", // amber
  "var(--admin-chart-2)", // mint (was teal)
  "var(--color-violet)", // violet
  "var(--admin-muted)", // slate
] as const;

export function epicColor(color: string | null | undefined): string {
  return color && EPIC_COLORS.includes(color as (typeof EPIC_COLORS)[number]) ? color : EPIC_COLORS[0];
}

/**
 * The palette index of an epic's colour, for the `data-epic-color` attribute
 * the dot, chip and swatch classes in admin.css paint from — so no board
 * surface needs an inline style for a colour that is always one of the tokens.
 */
export function epicColorIndex(color: string | null | undefined): number {
  return EPIC_COLORS.indexOf(epicColor(color) as (typeof EPIC_COLORS)[number]);
}

// The link slot (tasks.subject_type). One link per card: a coaching commitment
// OR a client roadmap item, never both.
export const SUBJECT_COMMITMENT = "coaching_commitment";
export const SUBJECT_BACKLOG_ITEM = "client_backlog_item";

// metadata.source for cards filed by a scheduled routine (they get an AGENT badge).
export const SOURCE_AGENT = "agent";

// A card sitting in one column longer than this shows an amber "aging" clock.
export const AGING_DAYS = 7;

// A card assigned to the viewer within this window wears a "New" chip.
// metadata.assigned_at is stamped on (re)assignment; older cards predate the
// stamp, so created_at is the fallback.
export const NEW_ASSIGNMENT_DAYS = 3;

// "Khôi Lê" -> "KL", for the avatar chips.
// Kept as a re-export: board components import `initials` from here.
export { initials } from "@/kernel/ui/format";

export function assignedAt(card: { metadata: Record<string, unknown>; created_at: string }): string {
  const stamped = card.metadata?.["assigned_at"];
  return typeof stamped === "string" ? stamped : card.created_at;
}

// Every board seeds with these four columns; they can be renamed/reordered later.
export const DEFAULT_COLUMNS: Array<{ name: string; is_done: boolean }> = [
  { name: "To do", is_done: false },
  { name: "Doing", is_done: false },
  { name: "Waiting", is_done: false },
  { name: "Done", is_done: true },
];

export type BoardRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  client_company_id: string | null;
  // NULL = company-wide (or internal) board; set = keyed to one AI Program.
  ai_program_id: string | null;
  owner_id: string | null;
  status: BoardStatus;
  sort_order: number;
};

export const BOARD_SELECT =
  "id, name, slug, description, client_company_id, ai_program_id, owner_id, status, sort_order";

export type BoardColumnRow = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  is_done: boolean;
};

export const BOARD_COLUMN_SELECT = "id, board_id, name, position, is_done";

export type SprintRow = {
  id: string;
  board_id: string;
  name: string;
  goal: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: SprintStatus;
  sort_order: number;
  meeting_id: string | null;
  focus_improvement: string | null;
  going_well: string | null;
  meeting_summary: string | null;
};

export const SPRINT_SELECT =
  "id, board_id, name, goal, starts_on, ends_on, status, sort_order, meeting_id, focus_improvement, going_well, meeting_summary";

export type EpicRow = {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: EpicStatus;
  sort_order: number;
};

export const EPIC_SELECT = "id, board_id, name, description, color, status, sort_order";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  board_id: string | null;
  board_column_id: string | null;
  sprint_id: string | null;
  epic_id: string | null;
  position: number;
  assignee_id: string | null;
  created_by: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  human_tokens: number | null;
  completed_at: string | null;
  internal: boolean;
  subject_type: string | null;
  subject_id: string | null;
  parent_task_id: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const TASK_SELECT =
  "id, title, description, board_id, board_column_id, sprint_id, epic_id, position, assignee_id, created_by, status, priority, due_date, human_tokens, completed_at, internal, subject_type, subject_id, parent_task_id, metadata, archived_at, created_at, updated_at";

// Whole days a card has sat in its current column, given the last move time.
export function daysInColumn(since: string | null | undefined, now: Date = new Date()): number {
  if (!since) return 0;
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/**
 * The card-move server action every board surface hands BoardView as `onMove`.
 * The implementation is team's (entities/team/lib/move-card.ts): its last step
 * syncs a coaching commitment, a team table, and company-os sits below team in
 * the layer order (Q2), so this entity owns only the contract.
 */
export type MoveCard = (
  taskId: string,
  toColumnId: string,
  boardSlug: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;
