import type { WorkboardCard } from "@/entities/company-os/modules/boards/workboard";
import type { TaskPriority } from "@/entities/company-os/modules/boards/types";

// The card as the workboard places it (an optimistic lane override layered on
// the server's laneId), the card form, and the two callback shapes the board
// hands its drawers. Split out of BoardView.tsx (Q3, 2026-09-05); lane-based
// since WB-01, when one Workboard began serving every surface.

export type Card = WorkboardCard & { columnId: string };

// The client picker's value for a board with no client; "" means not chosen yet.
export const INTERNAL = "internal";

export type Form = {
  id: string | null; // null = create
  // The board the card is on (or, for a new card on a many-board scope, the
  // one chosen in the drawer) and the client that picked it (INTERNAL = none,
  // "" = not chosen yet).
  boardId: string;
  clientId: string;
  // The lane the card sits in; the board's laneColumn map turns it into a column.
  laneId: string;
  title: string;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
  humanTokens: string; // "" = not estimated
  description: string;
  prUrl: string; // related PR URL ("" = none)
  buildSummary: string; // short summary of the PR/build ("" = none)
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
