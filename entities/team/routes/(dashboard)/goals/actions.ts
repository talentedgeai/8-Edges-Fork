"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  getMyGoals,
  ladderLabelFor,
  myAddGoal,
  myDeleteGoal,
  myUpdateGoal,
  type MyGoalInput,
} from "@/entities/team/modules/coaching";
import { notifyGoalChange, summarize } from "@/entities/team/modules/coaching/goal-notify";

// Own-service FAST goal writes for /team/goals. Every mutation re-derives
// ownership inside lib/coaching/data.ts (my* = team_member_id is the actor's
// own), so a forged goal id buys nothing. Manager email + Lark fire only after
// the write succeeds, and never block it.

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/team/goals");
  revalidatePath("/team/my-coaching");
}

export async function addMyGoal(input: MyGoalInput): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await myAddGoal(actor, input);
  if (!res.ok) return res;

  notifyGoalChange(actor, "added", summarize(input, await ladderLabelFor(input.ladder)));
  refresh();
  return { ok: true };
}

export async function updateMyGoal(goalId: string, input: MyGoalInput): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await myUpdateGoal(actor, goalId, input);
  if (!res.ok) return res;

  notifyGoalChange(actor, "updated", summarize(input, await ladderLabelFor(input.ladder)));
  refresh();
  return { ok: true };
}

export async function deleteMyGoal(goalId: string): Promise<Result> {
  const actor = await requireTeamMember();

  // Read the row before it goes, so the notice can name what was deleted.
  // Scoped read: getMyGoals only ever returns the actor's own goals, so a
  // forged id simply finds nothing here and is rejected by myDeleteGoal.
  const goal = (await getMyGoals(actor)).find((g) => g.id === goalId);

  const res = await myDeleteGoal(actor, goalId);
  if (!res.ok) return res;

  if (goal) notifyGoalChange(actor, "deleted", summarize(goal, goal.ladder?.label ?? null));
  refresh();
  return { ok: true };
}
