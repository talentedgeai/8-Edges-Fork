import { addDays, dateMs, isoWeekKey, isoWeekMonday } from "@/kernel/config/dates";
import type { BoardRow, SprintRow } from "./types";

// Weekly sprints (WS-01, 2026-09-16). A board opts in through
// boards.metadata.weekly_sprints, whose value names the team chat that hears
// about it: the same three chats the daily check-in serves. Absent means the
// board plans its sprints by hand. Everything here is arithmetic on the rows;
// the Tuesday routine (crons/weekly-sprints.ts) does the reading and writing.

export const WEEKLY_SPRINTS_KEY = "weekly_sprints";

export const SPRINT_CHATS = [
  { key: "product", label: "Product Team" },
  { key: "eo", label: "EO" },
  { key: "ops", label: "Operations" },
] as const;

export type SprintChat = (typeof SPRINT_CHATS)[number]["key"];

export function weeklySprintChat(board: Pick<BoardRow, "metadata">): SprintChat | null {
  const value = board.metadata?.[WEEKLY_SPRINTS_KEY];
  return SPRINT_CHATS.some((c) => c.key === value) ? (value as SprintChat) : null;
}

// The week a Tuesday plans. A sprint runs Wednesday to the next Tuesday, so
// the planning meeting closes one sprint and opens the next on the same day,
// which is how the boards that plan by hand already run.
const TUESDAY = 2;

/** The Tuesday on or after a Saigon calendar date. */
export function planningDayOnOrAfter(today: string): string {
  const weekday = new Date(dateMs(today)).getUTCDay();
  return addDays(today, (TUESDAY - weekday + 7) % 7);
}

export type SprintWindow = { startsOn: string; endsOn: string };

// The company sprint week (SW-01, 2026-09-17). Every sprint runs Wednesday to
// Tuesday, so the week is a company fact and each board's sprint hangs off
// it: sprints.week holds the ISO week of the sprint's first day ("2026-W38"),
// one per board, and the Workboard and the planning page filter on the key
// rather than on each board's own sprint names.
export const sprintWeek = (startsOn: string): string => isoWeekKey(startsOn);

/** The Wednesday-to-Tuesday window a week key names; null for a malformed key. */
export function weekWindow(week: string): SprintWindow | null {
  const monday = isoWeekMonday(week);
  return monday ? { startsOn: addDays(monday, 2), endsOn: addDays(monday, 8) } : null;
}

/** "W38" from "2026-W38": the short form the strip and the filters show. */
export const weekShort = (week: string): string => week.slice(week.indexOf("W"));

export function sprintWindow(planningDay: string): SprintWindow {
  return { startsOn: addDays(planningDay, 1), endsOn: addDays(planningDay, 7) };
}

/**
 * The sprint that already covers any day of the window, if one does. A board
 * that set a longer sprint by hand is left alone, and a second run on the same
 * Tuesday creates nothing: the rows themselves are the routine's idempotency.
 */
export function sprintCovering<S extends Pick<SprintRow, "starts_on" | "ends_on">>(sprints: S[], w: SprintWindow): S | null {
  for (const s of sprints) {
    const from = s.starts_on ?? s.ends_on;
    const to = s.ends_on ?? s.starts_on;
    if (from && to && from <= w.endsOn && to >= w.startsOn) return s;
  }
  return null;
}

// "Sprint 12", "Y26 Sprint 36", "Sprint 3 - Theme": the number the board counts
// by and whatever it writes before it. Anything else does not count.
const NUMBERED = /^(.*?\bSprint\s+)(\d+)\b/i;

/**
 * The next name in the board's own numbering: one past its highest numbered
 * sprint, keeping that sprint's prefix ("Y26 Sprint 37" after "Y26 Sprint
 * 36"), and "Sprint 1" on a board that has never numbered one. A theme, when
 * the draft found one, follows the number the way the team writes it by hand.
 */
export function nextSprintName(sprints: Pick<SprintRow, "name">[], theme: string | null): string {
  let prefix = "Sprint ";
  let highest = 0;
  for (const s of sprints) {
    const m = NUMBERED.exec(s.name.trim());
    if (!m) continue;
    const n = Number(m[2]);
    if (n > highest) {
      highest = n;
      prefix = m[1];
    }
  }
  const base = `${prefix}${highest + 1}`;
  return theme ? `${base} - ${theme}` : base;
}
