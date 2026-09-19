import type { CoachingGoal } from "@/entities/coaching/lib/types";

// The summary strip's goal cell, as facts rather than as an expression inside
// the view: the active goal's title, its measure as one readable phrase, and
// the day it is due. It moved out of MyCoachingView when that file reached its
// size cap, and it belongs here anyway — the strip draws a goal, it does not
// decide how a goal reads.

export type StripGoalFacts = {
  title: string;
  // "119 of 200 students", or null while the goal carries no numbers.
  measure: string | null;
  dueDate: string | null;
};

export function stripGoal(goals: CoachingGoal[]): StripGoalFacts | null {
  const active = goals.find((g) => g.status === "active") ?? null;
  if (!active) return null;
  const unit = active.metricUnit ? ` ${active.metricUnit}` : "";
  return {
    title: active.title,
    measure:
      active.currentValue !== null && active.targetValue !== null
        ? `${active.currentValue} of ${active.targetValue}${unit}`
        : null,
    dueDate: active.dueDate,
  };
}
