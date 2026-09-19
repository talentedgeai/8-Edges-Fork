import { selectKeyResults } from "@/entities/org";
import type { CoachingGoal } from "../types";

// The A in FAST, with a number on it (K.62). A goal's card says which company
// key result it lifts, and — when that key result carries its own measure —
// where the company number stands. Without the number the line is a title, and
// a member has no way to tell whether the thing their goal pulls has moved.
//
// The Eight Edges tree belongs to the org entity, so it is read through the org
// door rather than by naming its tables (CLAUDE.md rule 4), exactly as
// member-ladder.ts reads the rung above the goal.
//
// One read for the whole tab: a card per goal would otherwise be a query per
// card. A read error yields an empty map, and the alignment line then shows
// only the label the goal already carries — what it showed before K.62.
type KeyResultRow = {
  id: string;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
};

export async function getGoalAlignmentMeasures(
  goals: Pick<CoachingGoal, "ladder">[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(
    new Set(
      goals
        .map((g) => (g.ladder?.kind === "key_result" ? g.ladder.id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (ids.length === 0) return out;
  const { data, error } = await selectKeyResults("id, unit, current_value, target_value").in("id", ids);
  if (error) {
    console.error("[team/coaching/goal-alignment] key_results", error);
    return out;
  }
  for (const kr of (data ?? []) as unknown as KeyResultRow[]) {
    if (kr.current_value === null || kr.target_value === null) continue;
    out.set(kr.id, `${kr.current_value} of ${kr.target_value}${kr.unit ? ` ${kr.unit}` : ""}`);
  }
  return out;
}
