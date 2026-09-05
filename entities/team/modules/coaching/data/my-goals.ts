import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { GOAL_STATUS_LABELS, type GoalStatus, type CoachingGoal, type LadderInput } from "../types";
import { GOAL_SELECT, getEdgesLadderOptions, toGoal } from "./goals";
import { ladderColumns, type Result } from "./shared";

export type MyGoalInput = {
  title: string;
  // Which company key result this goal ladders to (a few legacy goals still
  // ladder to an objective directly).
  // { kind: "none" } is a deliberate "stands on its own", not a missing value.
  ladder: LadderInput;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
};

// The actor's own active coaching profile, created on first save if they have
// none. Your goals are yours: a member with no manager on file still gets a
// profile, with coach_id left null (it is nullable for exactly this reason —
// scripts/coaching/coach-optional.mjs). The daily coaching cycle skips
// coachless profiles; the goals themselves work regardless.
export async function getOrCreateMyCoachingProfileId(
  actor: TeamActor,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  const { data: existing } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (existing) return { ok: true, profileId: (existing as { id: string }).id };

  const { data: me } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  const managerId = (me as { manager_id: string | null } | null)?.manager_id ?? null;

  const { data: created, error } = await companyOs
    .from("coaching_profiles")
    .insert({ team_member_id: actor.teamMemberId, coach_id: managerId })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "Could not start your goals. Try again." };
  return { ok: true, profileId: (created as { id: string }).id };
}

// Every goal on the actor's own profile, including ones their coach set for
// them: a FAST goal is jointly owned, and each change notifies the manager.
export async function getMyGoals(actor: TeamActor): Promise<CoachingGoal[]> {
  const { data: profile } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (!profile) return [];

  const [goals, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", (profile as { id: string }).id)
      .order("sort_order")
      .order("created_at"),
    getEdgesLadderOptions(),
  ]);
  return ((goals.data ?? []) as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
}

// The goal as the authorization gate needs it: whose profile it hangs off, and
// who wrote it. The IDOR gate for every my* goal mutation — a client-supplied
// goal id is never the authority.
async function goalOwnership(
  actor: TeamActor,
  goalId: string,
): Promise<{ mine: boolean; authored: boolean }> {
  const no = { mine: false, authored: false };
  if (!goalId) return no;
  const { data } = await companyOs
    .from("goals")
    .select("id, created_by, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)")
    .eq("id", goalId)
    .maybeSingle();
  if (!data) return no;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(
    r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null,
  );
  return {
    mine: prof?.team_member_id === actor.teamMemberId,
    authored: (r.created_by as string | null) === actor.teamMemberId,
  };
}

export function goalColumns(input: MyGoalInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    description_markdown: input.descriptionMarkdown?.trim() || null,
    status: input.status,
    quarter_label: input.quarterLabel?.trim() || null,
    metric_unit: input.metricUnit?.trim() || null,
    start_value: input.startValue,
    target_value: input.targetValue,
    current_value: input.currentValue,
    due_date: input.dueDate || null,
    ...ladderColumns(input.ladder),
  };
}

export function validateGoal(input: MyGoalInput): string | null {
  if (!input.title.trim()) return "Write the goal first.";
  // Every FAST goal ladders to a company goal; "stands on its own" is no
  // longer accepted from the goal forms (coach-tier quick edits are separate).
  if (input.ladder.kind === "none") return "Pick the company goal this ladders up to.";
  if (input.title.trim().length > 200) return "Keep the goal title under 200 characters.";
  if (!(input.status in GOAL_STATUS_LABELS)) return "Bad status.";
  for (const v of [input.startValue, input.targetValue, input.currentValue]) {
    if (v !== null && !Number.isFinite(v)) return "The measure values need to be numbers.";
  }
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return "Pick a valid due date.";
  return null;
}

// The human label behind a LadderInput, for the notices that name what a goal
// ladders to. Resolved server-side from the live Edges options, never trusted
// from the client.
export async function ladderLabelFor(ladder: LadderInput): Promise<string | null> {
  if (ladder.kind === "none") return null;
  const edges = await getEdgesLadderOptions();
  const pool = ladder.kind === "objective" ? edges.objectives : edges.keyResults;
  return (pool as { id: string; label: string }[]).find((x) => x.id === ladder.id)?.label ?? null;
}

export async function myAddGoal(actor: TeamActor, input: MyGoalInput): Promise<Result> {
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const profile = await getOrCreateMyCoachingProfileId(actor);
  if (!profile.ok) return { ok: false, error: profile.error };

  const { error } = await companyOs
    .from("goals")
    .insert({
      coaching_profile_id: profile.profileId,
      created_by: actor.teamMemberId,
      ...goalColumns(input),
    });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

// Editing stays open across the member's own profile: updating progress on a
// goal your coach set for you is the point of the F in FAST. Deleting is not
// (see myDeleteGoal).
export async function myUpdateGoal(
  actor: TeamActor,
  goalId: string,
  input: MyGoalInput,
): Promise<Result> {
  if (!(await goalOwnership(actor, goalId)).mine) return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await companyOs
    .from("goals")
    .update({ ...goalColumns(input), updated_at: new Date().toISOString() })
    .eq("id", goalId);
  return error ? { ok: false, error: "Could not save the goal." } : { ok: true };
}

// True delete, matching coachDeleteGoal: comments cascade, no tombstone.
// Only the author may delete: a goal your coach or manager set for you is
// theirs to remove, and you can still edit it or mark it dropped.
export async function myDeleteGoal(actor: TeamActor, goalId: string): Promise<Result> {
  const own = await goalOwnership(actor, goalId);
  if (!own.mine) return { ok: false, error: "Not found." };
  if (!own.authored) {
    return {
      ok: false,
      error: "This goal was set for you, so only whoever set it can delete it. You can edit it or mark it dropped.",
    };
  }
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}
