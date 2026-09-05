/**
 * The goal grammar "[quantity] [state] [object] per [period]", as a leaf: the
 * period vocabulary and the phrase composer. Both the goal store
 * (project-goals.ts) and the nightly AI suggestion (ai/suggest-goal.ts) need
 * these, and each imports the other for its real work, so the shared pieces
 * live here to keep that pair acyclic (Q2 made `import/no-cycle` an error).
 */

export type GoalPeriod = "day" | "week" | "month" | "quarter";
export const GOAL_PERIODS: GoalPeriod[] = ["day", "week", "month", "quarter"];

/**
 * Compose the display phrase from the grammar parts. "won" + "leads" gives
 * "won leads"; an empty state just yields the object.
 */
export function composeMetric(state: string, object: string): string {
  return [state.trim(), object.trim()].filter(Boolean).join(" ");
}
