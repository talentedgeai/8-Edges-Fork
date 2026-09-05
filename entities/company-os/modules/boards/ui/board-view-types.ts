import type { BoardCard } from "@/entities/company-os/modules/boards/data";
import type { TaskPriority } from "@/entities/company-os/modules/boards/types";

// The card as the board view places it (a column override layered on the
// server's board_column_id), the card form, and the two callback shapes the
// board hands its drawers. Split out of BoardView.tsx (Q3, 2026-09-05).

export type Card = BoardCard & { columnId: string };

export type Form = {
  id: string | null; // null = create
  columnId: string;
  title: string;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
  humanTokens: string; // "" = not estimated
  description: string;
  sprintId: string; // "" = no sprint
  origSprintId: string;
  epicId: string; // "" = no epic
  origEpicId: string;
  subjectType: string | null; // commitment cards are not roadmap-linkable
  subjectLabel: string | null;
  roadmapItemId: string; // "" = none
  origRoadmapItemId: string;
  internal: boolean;
  origInternal: boolean;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Runs one server action for a drawer: clears the board banner, runs `fn`
 * inside the board's transition, shows the error on failure, and on success
 * runs `onOk` then refreshes the route so the server's truth shows through.
 */
export type RunAction = (fn: () => Promise<ActionResult>, onOk?: () => void) => void;
