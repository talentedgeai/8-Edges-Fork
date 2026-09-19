import type { SprintRow } from "./types";
import { addDays } from "@/kernel/config/dates";
import { weekWindow, weeklySprintChat, type SprintChat } from "./sprint-cadence";
import type { WorkboardBoard, WorkboardCard, WorkboardData } from "./workboard";

// Sprint planning (SP-01, 2026-09-16): the Monday-to-Tuesday view where the
// team looks at every card that is not done and either commits it to next
// week's sprint or closes it. Three columns, derived here from the workboard
// read so the page and its tests share one rule:
//   open  - not done and not in the board's next sprint (the backlog, plus
//           what the ending sprint did not finish, flagged as carried);
//   next  - committed to the board's next sprint;
//   done  - finished since the last planning (older done cards are hidden).
// Only boards that run weekly sprints take part; the routine opens their next
// sprint on Monday, and a board's next sprint is its newest active one.
// A week (SW-01) can be chosen from the sprints' company week keys, newest
// first: then "next" is each board's sprint in that week and "done" is what
// finished inside its Wednesday-to-Tuesday window, so a past planning can be
// read back the way it was.

export type PlanningColumn = "open" | "next" | "done";

export const PLANNING_COLUMNS: { id: PlanningColumn; label: string }[] = [
  { id: "open", label: "Not done" },
  { id: "next", label: "Next sprint" },
  { id: "done", label: "Done this week" },
];

export type PlanningBoard = {
  board: WorkboardBoard;
  chat: SprintChat;
  // The sprint cards are committed to; null until the routine has opened one.
  next: SprintRow | null;
  // The older active sprints, closed by "Finish planning".
  ending: SprintRow[];
};

const startKey = (s: SprintRow) => s.starts_on ?? "";

/** The company weeks the weekly boards have sprints in, newest first. */
export function planningWeeks(data: Pick<WorkboardData, "boards" | "sprints">): string[] {
  const weekly = new Set(data.boards.filter((b) => weeklySprintChat(b)).map((b) => b.id));
  const weeks = new Set<string>();
  for (const s of data.sprints) if (s.week && weekly.has(s.board_id)) weeks.add(s.week);
  return [...weeks].sort((a, b) => b.localeCompare(a));
}

/**
 * The boards in planning. With no week, a board's next sprint is its newest
 * active one; with a week, it is the board's sprint in that week (null when
 * the board had none), and the older active sprints are still the ones
 * Finish planning closes.
 */
export function planningBoards(data: Pick<WorkboardData, "boards" | "sprints">, week: string | null = null): PlanningBoard[] {
  const out: PlanningBoard[] = [];
  for (const board of data.boards) {
    const chat = weeklySprintChat(board);
    if (!chat) continue;
    const own = data.sprints.filter((s) => s.board_id === board.id);
    const active = own.filter((s) => s.status === "active").sort((a, b) => startKey(b).localeCompare(startKey(a)));
    const next = week ? (own.find((s) => s.week === week) ?? null) : (active[0] ?? null);
    out.push({ board, chat, next, ending: active.filter((s) => s.id !== next?.id && (!next || startKey(s) < startKey(next))) });
  }
  return out;
}

/** The done column's window: the seven days before planning, or the chosen week itself. */
export function doneWindow(week: string | null, today: string): { since: string; until: string | null } {
  const w = week ? weekWindow(week) : null;
  return w ? { since: w.startsOn, until: addDays(w.endsOn, 1) } : { since: addDays(today, -7), until: null };
}

/** Which column a card sits in, or null when the view does not show it. */
export function planningColumn(
  card: Pick<WorkboardCard, "status" | "sprint_id" | "completed_at">,
  pb: PlanningBoard,
  since: string,
  until: string | null = null,
): PlanningColumn | null {
  if (card.status === "done") {
    const at = card.completed_at ?? "";
    return at >= since && (!until || at < until) ? "done" : null;
  }
  return pb.next && card.sprint_id === pb.next.id ? "next" : "open";
}

/** An open card the ending sprint did not finish: the one planning is about. */
export function isCarried(card: Pick<WorkboardCard, "status" | "sprint_id">, pb: PlanningBoard): boolean {
  return card.status !== "done" && !!card.sprint_id && card.sprint_id !== pb.next?.id;
}
