// A missed 1-1 asks, it does not roll silently (K.36). The pure half: what a
// scheduled 1-1 whose date has passed is, and the words both pages say about
// it. Kept out of cycle.ts so the rule reads and tests without a database, and
// out of the data layer so the client components may import the sentences.
//
// Nothing here counts or scores anything. A miss is a question — "what
// happened, and which way out do you want?" — never a figure about a person,
// and there is no red state on either page (CLAUDE.md).

import { diffDays } from "@/kernel/config/dates";
import type { OneOnOneStatus } from "./types";

// How long the cycle waits before it rolls past a missed 1-1. Three days is
// the weekend plus a working day: long enough that a Friday meeting missed for
// a good reason can still be moved or held on the Monday, short enough that
// nothing sits in the past for a whole cadence.
export const MISSED_GRACE_DAYS = 3;

export type MissedState =
  // The date has not passed, or the row is no longer a booking at all.
  | "upcoming"
  // The date passed and the grace window is still open: prompt both sides and
  // leave the profile's next date where it is, so the meeting is still there
  // to move or to hold.
  | "missed"
  // The grace window closed. The prompt stays, but the cycle rolls the next
  // date forward as it always did, because nothing may stick in the past.
  | "grace-over";

// The state of one booking, from the dates alone. missed_at deliberately does
// not enter this decision: it is the stamp that makes the write idempotent,
// not a fact about time, and a row that carries it is still "upcoming" once a
// move has put it on a future day.
export function missedState(input: {
  heldOn: string;
  status: OneOnOneStatus;
  todayISO: string;
}): MissedState {
  // Only a booking can be missed. A held 1-1 happened and a skipped one is a
  // cycle that was deliberately let go; neither is waiting on an answer.
  if (input.status !== "scheduled") return "upcoming";
  if (input.heldOn >= input.todayISO) return "upcoming";
  return diffDays(input.heldOn, input.todayISO) > MISSED_GRACE_DAYS ? "grace-over" : "missed";
}

// The coach's sentence, quoted from the card: the four ways out, in the order
// the prompt offers them.
export const MISSED_COACH_PROMPT =
  "This 1-1 did not happen: move it, mark it held, do it in writing, or skip it.";

// The member's half of the same sentence. They have two of the four ways out —
// skipping and marking it held are the coach's call, not theirs.
export const MISSED_MEMBER_PROMPT =
  "This 1-1 did not happen: ask to move it, or do it in writing.";

// "1-1 on Sep 16, 2026 did not happen" — the roster's attention label and the
// History timeline's note are built from the same words, so the coach and the
// member never read two different accounts of the same day.
export function missedLine(heldOn: string, formatDate: (iso: string) => string): string {
  return `1-1 on ${formatDate(heldOn)} did not happen`;
}
