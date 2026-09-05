import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { type GoalStatus, type PriorityStatus, type EdgesLadder, type GoalComment, type CoachingGoal, type EdgesOptions } from "../types";
import { displayName, type PersonEmbed } from "./rows";
import { type Result } from "./shared";

export type CoachingPriority = {
  id: string;
  title: string;
  detailMarkdown: string | null;
  status: PriorityStatus;
  ladder: EdgesLadder | null;
  sortOrder: number;
};

export type OceanDimension = { rating: string | null; evidence: string | null };

export type OceanProfile = {
  id: string;
  openness: OceanDimension;
  conscientiousness: OceanDimension;
  extraversion: OceanDimension;
  agreeableness: OceanDimension;
  neuroticism: OceanDimension;
  snapshotMarkdown: string | null;
  guidanceMarkdown: string | null;
  published: boolean;
  updatedAt: string;
};

export async function getEdgesLadderOptions(): Promise<EdgesOptions> {
  const [objs, krs] = await Promise.all([
    companyOs.from("objectives").select("id, title, sort_order").order("sort_order"),
    companyOs.from("key_results").select("id, title, objective_id, sort_order").order("sort_order"),
  ]);
  return {
    objectives: ((objs.data ?? []) as { id: string; title: string }[]).map((o) => ({ id: o.id, label: o.title })),
    keyResults: ((krs.data ?? []) as { id: string; title: string; objective_id: string | null }[]).map((k) => ({
      id: k.id,
      label: k.title,
      objectiveId: k.objective_id,
    })),
  };
}

// Writes/picker ladder to a key result only, but a handful of legacy goals still
// carry a direct objective_id: read and render those too.
function resolveLadder(
  r: { objective_id: string | null; key_result_id: string | null },
  edges: EdgesOptions,
): EdgesLadder | null {
  if (r.objective_id) {
    const o = edges.objectives.find((x) => x.id === r.objective_id);
    return o ? { kind: "objective", id: o.id, label: o.label } : null;
  }
  if (r.key_result_id) {
    const k = edges.keyResults.find((x) => x.id === r.key_result_id);
    return k ? { kind: "key_result", id: k.id, label: k.label } : null;
  }
  return null;
}

export const GOAL_SELECT =
  "id, coaching_profile_id, title, description_markdown, status, quarter_label, objective_id, key_result_id, sort_order, " +
  "metric_unit, start_value, target_value, current_value, due_date, created_by";

export const PRIORITY_SELECT =
  "id, coaching_profile_id, title, detail_markdown, status, objective_id, key_result_id, sort_order";

type LadderRow = { objective_id: string | null; key_result_id: string | null };

// PostgREST can hand numeric back as a string; keep the type honest.
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export function toGoal(r: Record<string, unknown>, edges: EdgesOptions): CoachingGoal {
  return {
    id: r.id as string,
    title: r.title as string,
    descriptionMarkdown: (r.description_markdown as string | null) ?? null,
    status: r.status as GoalStatus,
    quarterLabel: (r.quarter_label as string | null) ?? null,
    ladder: resolveLadder(r as unknown as LadderRow, edges),
    sortOrder: (r.sort_order as number) ?? 0,
    comments: [],
    metricUnit: (r.metric_unit as string | null) ?? null,
    startValue: num(r.start_value),
    targetValue: num(r.target_value),
    currentValue: num(r.current_value),
    dueDate: (r.due_date as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
  };
}

// Comments on FAST goals: team-wide readable, any team member can write
// (Frequent discussion is the F). Fetched per goal-id batch; the author name
// resolves through the team_members -> people forward embed.
export async function getGoalComments(goalIds: string[]): Promise<Map<string, GoalComment[]>> {
  const map = new Map<string, GoalComment[]>();
  if (goalIds.length === 0) return map;
  const { data } = await companyOs
    .from("coaching_goal_comments")
    .select(
      "id, goal_id, body, created_at, " +
        "team_members:team_members!author_team_member_id(people:people!person_id(full_name, preferred_name, email, avatar_url))",
    )
    .in("goal_id", goalIds)
    .order("created_at", { ascending: true });
  for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) {
    const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
    const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
    const goalId = r.goal_id as string;
    const list = map.get(goalId) ?? [];
    list.push({
      id: r.id as string,
      goalId,
      authorName: displayName(person),
      body: r.body as string,
      createdAt: r.created_at as string,
    });
    map.set(goalId, list);
  }
  return map;
}

export function attachComments(goals: CoachingGoal[], comments: Map<string, GoalComment[]>): CoachingGoal[] {
  return goals.map((g) => ({ ...g, comments: comments.get(g.id) ?? [] }));
}

export async function addGoalComment(
  actor: TeamActor,
  goalId: string,
  body: string,
): Promise<Result> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write the comment first." };
  if (text.length > 2000) return { ok: false, error: "Keep it under 2,000 characters." };
  const { data: goal } = await companyOs
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .maybeSingle();
  if (!goal) return { ok: false, error: "Goal not found." };
  const { error } = await companyOs.from("coaching_goal_comments").insert({
    goal_id: goalId,
    author_team_member_id: actor.teamMemberId,
    body: text,
  });
  return error ? { ok: false, error: "Could not add the comment." } : { ok: true };
}

export function toPriority(r: Record<string, unknown>, edges: EdgesOptions): CoachingPriority {
  return {
    id: r.id as string,
    title: r.title as string,
    detailMarkdown: (r.detail_markdown as string | null) ?? null,
    status: r.status as PriorityStatus,
    ladder: resolveLadder(r as unknown as LadderRow, edges),
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

export const OCEAN_SELECT =
  "id, coaching_profile_id, openness_rating, openness_evidence, conscientiousness_rating, conscientiousness_evidence, " +
  "extraversion_rating, extraversion_evidence, agreeableness_rating, agreeableness_evidence, " +
  "neuroticism_rating, neuroticism_evidence, snapshot_markdown, guidance_markdown, published, updated_at";

export function toOcean(r: Record<string, unknown>): OceanProfile {
  const dim = (k: string): OceanDimension => ({
    rating: (r[`${k}_rating`] as string | null) ?? null,
    evidence: (r[`${k}_evidence`] as string | null) ?? null,
  });
  return {
    id: r.id as string,
    openness: dim("openness"),
    conscientiousness: dim("conscientiousness"),
    extraversion: dim("extraversion"),
    agreeableness: dim("agreeableness"),
    neuroticism: dim("neuroticism"),
    snapshotMarkdown: (r.snapshot_markdown as string | null) ?? null,
    guidanceMarkdown: (r.guidance_markdown as string | null) ?? null,
    published: Boolean(r.published),
    updatedAt: r.updated_at as string,
  };
}
