// Team Coaching Cycle data access (docs/plans/2026-07-25-team-coaching-cycle.md).
// The ONLY sanctioned path to the coaching_* tables. The coaching relationship
// is coach_id on coaching_profiles — deliberately NOT the org chart's
// manager_id and NOT actor.teamMemberScope, because dotted lines are
// first-class (My reports to Mai but is coached by Dave). That is why these
// tables are not in lib/team/data.ts's SCOPE_ALLOWLIST: their scope column is
// the coach, not the member.
//
// TWO TIERS, ENFORCED HERE:
//   coach tier  — every function prefixed coach* filters coach_id =
//                 actor.teamMemberId (from the JWT-derived actor, never client
//                 input) and re-derives ownership before any write.
//   member tier — every function prefixed my* filters team_member_id =
//                 actor.teamMemberId and selects ONLY member-visible fields:
//                 FAST goals, priorities, published OCEAN, commitments,
//                 check-ins, and shared recaps that have been PUBLISHED.
//                 Prep, transcripts, private summaries, private profile,
//                 trends and context never appear in a member-tier select.

import { companyOs } from "@/lib/supabase";
import type { TeamActor } from "@/lib/team-auth";
import { saveCoachingTranscript } from "@/lib/coaching/transcript";
import { listActiveBoards } from "@/lib/boards/data";
import { SUBJECT_COMMITMENT } from "@/lib/boards/types";
import { one } from "@/lib/embedded";
import { saigonToday, addDays, diffDays } from "@/lib/dates";

// Boards a coach may push a commitment to: their own memberships (admins: all).
// Scoped so the picker never exposes unrelated client boards.
async function coachBoards(actor: TeamActor): Promise<{ id: string; slug: string; name: string }[]> {
  if (actor.isAdmin) return listActiveBoards();
  const { data: mem } = await companyOs
    .from("board_members")
    .select("board_id")
    .eq("person_id", actor.personId);
  const ids = ((mem ?? []) as { board_id: string }[]).map((m) => m.board_id);
  if (ids.length === 0) return [];
  const { data } = await companyOs
    .from("boards")
    .select("id, slug, name")
    .in("id", ids)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

// A pushed commitment's board card, for the inline "on the board" status.
export type CommitmentCard = {
  boardSlug: string;
  boardName: string;
  columnName: string;
  done: boolean;
};

async function loadCommitmentCards(ids: string[]): Promise<Record<string, CommitmentCard>> {
  if (ids.length === 0) return {};
  const { data } = await companyOs
    .from("tasks")
    .select("subject_id, board_id, board_column_id, status")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .in("subject_id", ids)
    .is("archived_at", null);
  const rows = (data ?? []) as {
    subject_id: string;
    board_id: string;
    board_column_id: string | null;
    status: string;
  }[];
  if (rows.length === 0) return {};
  const boardIds = [...new Set(rows.map((r) => r.board_id))];
  const colIds = [...new Set(rows.map((r) => r.board_column_id).filter(Boolean) as string[])];
  const [boardsRes, colsRes] = await Promise.all([
    companyOs.from("boards").select("id, slug, name").in("id", boardIds),
    colIds.length
      ? companyOs.from("board_columns").select("id, name").in("id", colIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const bmap = new Map((boardsRes.data ?? []).map((b) => [b.id, b as { id: string; slug: string; name: string }]));
  const cmap = new Map((colsRes.data ?? []).map((c) => [c.id, (c as { id: string; name: string }).name]));
  const out: Record<string, CommitmentCard> = {};
  for (const r of rows) {
    const b = bmap.get(r.board_id);
    if (!b) continue;
    out[r.subject_id] = {
      boardSlug: b.slug,
      boardName: b.name,
      columnName: r.board_column_id ? cmap.get(r.board_column_id) ?? "" : "",
      done: r.status === "done",
    };
  }
  return out;
}

// (getEdgesLadderOptions below is also consumed by lib/coaching/ai.ts to give
// the generators live goal-ladder context.)

// ---- date helpers (YYYY-MM-DD, Saigon-date semantics) -----------------------
// Canonical copies live in lib/dates; re-exported for the coaching callers that
// import them alongside the data loaders.
export { saigonToday, addDays, diffDays };
export type GoalStatus = "draft" | "active" | "achieved" | "dropped";
export type PriorityStatus = "active" | "retired";
export type RetentionRoot = "belonging" | "links" | "sacrifice" | "watching";
export type OneOnOneStatus = "scheduled" | "held" | "skipped";
export type CommitmentOwner = "coach" | "member";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  draft: "Draft",
  active: "Active",
  achieved: "Achieved",
  dropped: "Dropped",
};

export const RETENTION_ROOT_LABELS: Record<RetentionRoot, string> = {
  belonging: "Belonging (fit)",
  links: "Links",
  sacrifice: "Sacrifice",
  watching: "Watching",
};
export type CommitmentStatus =
  | "open"
  | "on_track"
  | "needs_attention"
  | "completed"
  | "dropped"
  | "blocked";

export const OPEN_COMMITMENT_STATUSES: CommitmentStatus[] = [
  "open",
  "on_track",
  "needs_attention",
  "blocked",
];

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  open: "Open",
  on_track: "On track",
  needs_attention: "Needs attention",
  completed: "Completed",
  dropped: "Dropped",
  blocked: "Blocked",
};

type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

const displayName = (p: PersonEmbed | null): string =>
  p?.preferred_name || p?.full_name || p?.email || "-";

export type CoachingMember = {
  teamMemberId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
};

const MEMBER_EMBED =
  "team_members:team_members!team_member_id(id, " +
  "people:people!person_id(full_name, preferred_name, email, avatar_url), " +
  "positions:positions!position_id(title))";

function toMember(raw: Record<string, unknown>): CoachingMember {
  const tm = one(raw.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    teamMemberId: (tm?.id as string) ?? "",
    name: displayName(person),
    email: person?.email ?? null,
    avatarUrl: person?.avatar_url ?? null,
    positionTitle: pos?.title ?? null,
  };
}

export type Commitment = {
  id: string;
  coachingProfileId: string;
  oneOnOneId: string | null;
  title: string;
  owner: CommitmentOwner;
  dueOn: string | null;
  status: CommitmentStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  // Position in the one shared priority stack; lower sorts first.
  sortOrder: number;
  // The team member who wrote it. Null on rows predating authorship, which
  // reads as coach-authored — only the author may retitle or delete.
  createdBy: string | null;
};

function toCommitment(r: Record<string, unknown>): Commitment {
  return {
    id: r.id as string,
    coachingProfileId: r.coaching_profile_id as string,
    oneOnOneId: (r.one_on_one_id as string | null) ?? null,
    title: r.title as string,
    owner: r.owner as CommitmentOwner,
    dueOn: (r.due_on as string | null) ?? null,
    status: r.status as CommitmentStatus,
    statusNote: (r.status_note as string | null) ?? null,
    statusUpdatedAt: (r.status_updated_at as string | null) ?? null,
    createdAt: r.created_at as string,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: (r.created_by as string | null) ?? null,
  };
}

const COMMITMENT_SELECT =
  "id, coaching_profile_id, one_on_one_id, title, owner, due_on, status, status_note, status_updated_at, created_at, sort_order, created_by";

// ---- coach tier -------------------------------------------------------------

export type RosterAttention =
  | { kind: "overdue"; daysSince: number }
  | { kind: "never_met" }
  | { kind: "goal_not_set" }
  | { kind: "checkin_unanswered" };

export type CoachRosterRow = {
  profileId: string;
  member: CoachingMember;
  activeGoals: string[];
  topPriority: string | null;
  retentionRoot: RetentionRoot | null;
  lastModeSplit: ModeSplit | null;
  cadenceDays: number;
  nextOneOnOneOn: string | null;
  lastHeldOn: string | null;
  heldCount: number;
  openCommitments: number;
  attention: RosterAttention[];
};

const PROFILE_SELECT =
  "id, team_member_id, coach_id, " +
  "private_profile_markdown, cadence_days, next_one_on_one_on, retention_root, active, " +
  MEMBER_EMBED;

// ---- FAST goals, priorities, OCEAN (v2) -------------------------------------
// Goals are TEAM-WIDE readable (the T in FAST); priorities are coach+member;
// the OCEAN profile is coach-authored and member-visible only once published.

export type EdgesLadder =
  | { kind: "objective"; id: string; label: string }
  | { kind: "key_result"; id: string; label: string };

export type GoalComment = {
  id: string;
  goalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type CoachingGoal = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  ladder: EdgesLadder | null;
  sortOrder: number;
  comments: GoalComment[];
  // The member-authored measure (/team/goals). Null on goals that carry no
  // number of their own.
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  // The team member who wrote the goal, null on goals set by a coach or
  // predating authorship. Only the author may delete it.
  createdBy: string | null;
};

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

export const OCEAN_DIMENSIONS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
export type OceanDimensionKey = (typeof OCEAN_DIMENSIONS)[number];

// Everything the ladder picker offers: the company objectives and their key
// results. Both tables are small.
export type EdgesOptions = {
  objectives: { id: string; label: string }[];
  keyResults: { id: string; label: string; objectiveId: string | null }[];
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

const GOAL_SELECT =
  "id, coaching_profile_id, title, description_markdown, status, quarter_label, objective_id, key_result_id, sort_order, " +
  "metric_unit, start_value, target_value, current_value, due_date, created_by";
const PRIORITY_SELECT =
  "id, coaching_profile_id, title, detail_markdown, status, objective_id, key_result_id, sort_order";

type LadderRow = { objective_id: string | null; key_result_id: string | null };

// PostgREST can hand numeric back as a string; keep the type honest.
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

function toGoal(r: Record<string, unknown>, edges: EdgesOptions): CoachingGoal {
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

function attachComments(goals: CoachingGoal[], comments: Map<string, GoalComment[]>): CoachingGoal[] {
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

function toPriority(r: Record<string, unknown>, edges: EdgesOptions): CoachingPriority {
  return {
    id: r.id as string,
    title: r.title as string,
    detailMarkdown: (r.detail_markdown as string | null) ?? null,
    status: r.status as PriorityStatus,
    ladder: resolveLadder(r as unknown as LadderRow, edges),
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

const OCEAN_SELECT =
  "id, coaching_profile_id, openness_rating, openness_evidence, conscientiousness_rating, conscientiousness_evidence, " +
  "extraversion_rating, extraversion_evidence, agreeableness_rating, agreeableness_evidence, " +
  "neuroticism_rating, neuroticism_evidence, snapshot_markdown, guidance_markdown, published, updated_at";

function toOcean(r: Record<string, unknown>): OceanProfile {
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

// True if the actor coaches at least one active profile — drives the sidebar
// entry and the /team/coaching gate. Coaching is granted by rows, not role:
// a dotted-line coach may not be anyone's org-chart manager.
export async function isCoach(actor: TeamActor): Promise<boolean> {
  const { count } = await companyOs
    .from("coaching_profiles")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", actor.teamMemberId)
    .eq("active", true);
  return (count ?? 0) > 0;
}

// True if the actor is themselves in a coaching cycle — drives the "My
// coaching" sidebar entry.
export async function isCoached(actor: TeamActor): Promise<boolean> {
  const { count } = await companyOs
    .from("coaching_profiles")
    .select("id", { count: "exact", head: true })
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true);
  return (count ?? 0) > 0;
}

// The coach's roster with everything the dashboard cards need. One query per
// table, joined in memory — the roster is a handful of people, not a feed.
export async function getCoachRoster(actor: TeamActor): Promise<CoachRosterRow[]> {
  const { data } = await companyOs
    .from("coaching_profiles")
    .select(PROFILE_SELECT)
    .eq("coach_id", actor.teamMemberId)
    .eq("active", true);
  const profiles = ((data ?? []) as unknown as Record<string, unknown>[]);
  if (profiles.length === 0) return [];
  const ids = profiles.map((p) => p.id as string);

  const [meetingsRes, commitmentsRes, checkinsRes, goalsRes] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("coaching_profile_id, held_on, status, mode_coach_pct, mode_mentor_pct, mode_direct_pct")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .eq("status", "held"),
    companyOs
      .from("coaching_commitments")
      .select("coaching_profile_id, status")
      .in("coaching_profile_id", ids)
      .in("status", OPEN_COMMITMENT_STATUSES),
    companyOs
      .from("coaching_checkins")
      .select("coaching_profile_id, sent_at, responded_at")
      .in("coaching_profile_id", ids)
      .order("sent_at", { ascending: false }),
    companyOs
      .from("goals")
      .select("coaching_profile_id, title, status, sort_order")
      .in("coaching_profile_id", ids)
      .eq("status", "active")
      .order("sort_order"),
  ]);
  const prioritiesRes = await companyOs
    .from("coaching_priorities")
    .select("coaching_profile_id, title, sort_order")
    .in("coaching_profile_id", ids)
    .eq("status", "active")
    .order("sort_order");

  const lastHeld = new Map<string, string>();
  const heldCount = new Map<string, number>();
  const lastMode = new Map<string, { held_on: string; split: ModeSplit }>();
  for (const m of (meetingsRes.data ?? []) as Array<{
    coaching_profile_id: string;
    held_on: string;
    mode_coach_pct: number | null;
    mode_mentor_pct: number | null;
    mode_direct_pct: number | null;
  }>) {
    heldCount.set(m.coaching_profile_id, (heldCount.get(m.coaching_profile_id) ?? 0) + 1);
    const cur = lastHeld.get(m.coaching_profile_id);
    if (!cur || m.held_on > cur) lastHeld.set(m.coaching_profile_id, m.held_on);
    if (m.mode_coach_pct != null) {
      const prev = lastMode.get(m.coaching_profile_id);
      if (!prev || m.held_on > prev.held_on) {
        lastMode.set(m.coaching_profile_id, {
          held_on: m.held_on,
          split: { coach: m.mode_coach_pct, mentor: m.mode_mentor_pct ?? 0, direct: m.mode_direct_pct ?? 0 },
        });
      }
    }
  }
  const activeGoals = new Map<string, string[]>();
  for (const g of (goalsRes.data ?? []) as Array<{ coaching_profile_id: string; title: string }>) {
    const list = activeGoals.get(g.coaching_profile_id) ?? [];
    list.push(g.title);
    activeGoals.set(g.coaching_profile_id, list);
  }
  // First active priority per profile (rows arrive sorted by sort_order).
  const topPriority = new Map<string, string>();
  for (const p of (prioritiesRes.data ?? []) as Array<{ coaching_profile_id: string; title: string }>) {
    if (!topPriority.has(p.coaching_profile_id)) topPriority.set(p.coaching_profile_id, p.title);
  }
  const openCount = new Map<string, number>();
  for (const c of (commitmentsRes.data ?? []) as Array<{ coaching_profile_id: string }>) {
    openCount.set(c.coaching_profile_id, (openCount.get(c.coaching_profile_id) ?? 0) + 1);
  }
  // Latest check-in per profile (rows arrive newest-first).
  const latestCheckin = new Map<string, { sent_at: string; responded_at: string | null }>();
  for (const c of (checkinsRes.data ?? []) as Array<{
    coaching_profile_id: string;
    sent_at: string;
    responded_at: string | null;
  }>) {
    if (!latestCheckin.has(c.coaching_profile_id)) latestCheckin.set(c.coaching_profile_id, c);
  }

  const today = saigonToday();
  const rows = profiles.map((p) => {
    const id = p.id as string;
    const cadence = (p.cadence_days as number) ?? 14;
    const last = lastHeld.get(id) ?? null;
    const attention: RosterAttention[] = [];
    if (!last) attention.push({ kind: "never_met" });
    else {
      const since = diffDays(last, today);
      if (since > cadence + 3) attention.push({ kind: "overdue", daysSince: since });
    }
    const goals = activeGoals.get(id) ?? [];
    if (goals.length === 0) attention.push({ kind: "goal_not_set" });
    const checkin = latestCheckin.get(id);
    if (checkin && !checkin.responded_at && diffDays(checkin.sent_at.slice(0, 10), today) >= 2) {
      attention.push({ kind: "checkin_unanswered" });
    }
    return {
      profileId: id,
      member: toMember(p),
      activeGoals: goals,
      topPriority: topPriority.get(id) ?? null,
      retentionRoot: (p.retention_root as RetentionRoot | null) ?? null,
      lastModeSplit: lastMode.get(id)?.split ?? null,
      cadenceDays: cadence,
      nextOneOnOneOn: (p.next_one_on_one_on as string | null) ?? null,
      lastHeldOn: last,
      heldCount: heldCount.get(id) ?? 0,
      openCommitments: openCount.get(id) ?? 0,
      attention,
    };
  });
  return rows.sort((a, b) => a.member.name.localeCompare(b.member.name));
}

export type ModeSplit = { coach: number; mentor: number; direct: number };

export type OneOnOne = {
  id: string;
  heldOn: string;
  status: OneOnOneStatus;
  prepMarkdown: string | null;
  prepGeneratedAt: string | null;
  transcript: string | null;
  summaryMarkdown: string | null;
  sharedSummaryMarkdown: string | null;
  sharedPublishedAt: string | null;
  modeSplit: ModeSplit | null;
  minutesToken: string | null;
  transcriptSource: "minutes_auto" | "minutes_link" | "manual" | null;
  aiModel: string | null;
  aiError: string | null;
};

const MEETING_SELECT =
  "id, coaching_profile_id, held_on, status, prep_markdown, prep_generated_at, transcript, " +
  "summary_markdown, shared_summary_markdown, shared_published_at, " +
  "mode_coach_pct, mode_mentor_pct, mode_direct_pct, minutes_token, transcript_source, ai_model, ai_error, " +
  "meeting_id, linked_meeting:meetings!meeting_id(call_transcripts(transcript))";

// The transcript now lives in call_transcripts on the linked meeting; the
// coaching_one_on_ones.transcript column is a legacy mirror kept as a fallback
// for any row not yet migrated.
function transcriptFrom(r: Record<string, unknown>): string | null {
  const lm = r.linked_meeting as
    | { call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null }
    | { call_transcripts?: unknown }[]
    | null;
  const meeting = Array.isArray(lm) ? lm[0] : lm;
  const ct = meeting?.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null
    | undefined;
  const fromMeeting = (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? null;
  return fromMeeting ?? (r.transcript as string | null) ?? null;
}

function toOneOnOne(r: Record<string, unknown>): OneOnOne {
  return {
    id: r.id as string,
    heldOn: r.held_on as string,
    status: r.status as OneOnOneStatus,
    prepMarkdown: (r.prep_markdown as string | null) ?? null,
    prepGeneratedAt: (r.prep_generated_at as string | null) ?? null,
    transcript: transcriptFrom(r),
    summaryMarkdown: (r.summary_markdown as string | null) ?? null,
    sharedSummaryMarkdown: (r.shared_summary_markdown as string | null) ?? null,
    sharedPublishedAt: (r.shared_published_at as string | null) ?? null,
    modeSplit:
      r.mode_coach_pct == null
        ? null
        : {
            coach: r.mode_coach_pct as number,
            mentor: r.mode_mentor_pct as number,
            direct: r.mode_direct_pct as number,
          },
    minutesToken: (r.minutes_token as string | null) ?? null,
    transcriptSource: (r.transcript_source as "minutes_auto" | "minutes_link" | "manual" | null) ?? null,
    aiModel: (r.ai_model as string | null) ?? null,
    aiError: (r.ai_error as string | null) ?? null,
  };
}

export type Checkin = {
  id: string;
  sentAt: string;
  messageMarkdown: string;
  respondedAt: string | null;
};

export type TrendReport = {
  id: string;
  period: string;
  reportMarkdown: string | null;
  aiError: string | null;
  createdAt: string;
};

// A talking point the member raises before a 1-1 (their half of the agenda).
export type TalkingPoint = {
  id: string;
  body: string;
  authorTeamMemberId: string | null;
  addressedAt: string | null;
  createdAt: string;
};

const TALKING_POINT_SELECT = "id, body, author_team_member_id, addressed_at, created_at";

function toTalkingPoint(r: Record<string, unknown>): TalkingPoint {
  return {
    id: r.id as string,
    body: r.body as string,
    authorTeamMemberId: (r.author_team_member_id as string | null) ?? null,
    addressedAt: (r.addressed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export type CoachProfileDetail = {
  profileId: string;
  member: CoachingMember;
  goals: CoachingGoal[];
  priorities: CoachingPriority[];
  ocean: OceanProfile | null;
  retentionRoot: RetentionRoot | null;
  edges: EdgesOptions;
  privateProfileMarkdown: string | null;
  cadenceDays: number;
  nextOneOnOneOn: string | null;
  meetings: OneOnOne[];
  commitments: Commitment[];
  talkingPoints: TalkingPoint[];
  checkins: Checkin[];
  trends: TrendReport[];
  // Boards the coach can push a commitment to, and any commitment already pushed.
  boards: { id: string; slug: string; name: string }[];
  commitmentCards: Record<string, CommitmentCard>;
};

// Ownership assertion for every coach-side read/write that takes a profile id
// from the client. Returns the raw profile row iff the actor is its coach.
export async function assertCoachOwnsProfile(
  actor: TeamActor,
  profileId: string,
): Promise<Record<string, unknown> | null> {
  if (!profileId) return null;
  const { data } = await companyOs
    .from("coaching_profiles")
    .select(PROFILE_SELECT)
    .eq("id", profileId)
    .eq("coach_id", actor.teamMemberId)
    .maybeSingle();
  return (data as unknown as Record<string, unknown>) ?? null;
}

export async function getCoachProfileDetail(
  actor: TeamActor,
  profileId: string,
): Promise<CoachProfileDetail | null> {
  const p = await assertCoachOwnsProfile(actor, profileId);
  if (!p) return null;

  const [meetings, commitments, talkingPoints, checkins, trends, goals, priorities, ocean, edges] =
    await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select(MEETING_SELECT)
      .eq("coaching_profile_id", profileId)
      .is("archived_at", null)
      .order("held_on", { ascending: false }),
    companyOs
      .from("coaching_commitments")
      .select(COMMITMENT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    companyOs
      .from("coaching_talking_points")
      .select(TALKING_POINT_SELECT)
      .eq("coaching_profile_id", profileId)
      .is("addressed_at", null)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_checkins")
      .select("id, sent_at, message_markdown, responded_at")
      .eq("coaching_profile_id", profileId)
      .order("sent_at", { ascending: false }),
    companyOs
      .from("coaching_trends")
      .select("id, period, report_markdown, ai_error, created_at")
      .eq("coaching_profile_id", profileId)
      .order("period", { ascending: false }),
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at"),
    companyOs
      .from("coaching_priorities")
      .select(PRIORITY_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at"),
    companyOs
      .from("coaching_ocean_profiles")
      .select(OCEAN_SELECT)
      .eq("coaching_profile_id", profileId)
      .maybeSingle(),
    getEdgesLadderOptions(),
  ]);

  const goalRows = ((goals.data ?? []) as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
  const goalComments = await getGoalComments(goalRows.map((g) => g.id));

  const commitmentList = ((commitments.data ?? []) as unknown as Record<string, unknown>[]).map(toCommitment);
  const [boards, commitmentCards] = await Promise.all([
    coachBoards(actor),
    loadCommitmentCards(commitmentList.map((c) => c.id)),
  ]);

  return {
    profileId,
    member: toMember(p),
    boards,
    commitmentCards,
    goals: attachComments(goalRows, goalComments),
    priorities: ((priorities.data ?? []) as unknown as Record<string, unknown>[]).map((x) => toPriority(x, edges)),
    ocean: ocean.data ? toOcean(ocean.data as unknown as Record<string, unknown>) : null,
    retentionRoot: (p.retention_root as RetentionRoot | null) ?? null,
    edges,
    privateProfileMarkdown: (p.private_profile_markdown as string | null) ?? null,
    cadenceDays: (p.cadence_days as number) ?? 14,
    nextOneOnOneOn: (p.next_one_on_one_on as string | null) ?? null,
    meetings: ((meetings.data ?? []) as unknown as Record<string, unknown>[]).map(toOneOnOne),
    commitments: commitmentList,
    talkingPoints: ((talkingPoints.data ?? []) as unknown as Record<string, unknown>[]).map(toTalkingPoint),
    checkins: ((checkins.data ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      sentAt: c.sent_at as string,
      messageMarkdown: c.message_markdown as string,
      respondedAt: (c.responded_at as string | null) ?? null,
    })),
    trends: ((trends.data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
      id: t.id as string,
      period: t.period as string,
      reportMarkdown: (t.report_markdown as string | null) ?? null,
      aiError: (t.ai_error as string | null) ?? null,
      createdAt: t.created_at as string,
    })),
  };
}

type Result = { ok: true } | { ok: false; error: string };

async function patchProfile(profileId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}

async function patchMeeting(meetingId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_one_on_ones")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}

// Every coach-side mutation below asserts ownership first (IDOR: never trust a
// client-supplied id as the authorization subject).

// Ladder input from the picker: at most one Edges target.
export type LadderInput =
  | { kind: "none" }
  | { kind: "objective" | "key_result"; id: string };

function ladderColumns(ladder: LadderInput): Record<string, string | null> {
  return {
    objective_id: ladder.kind === "objective" ? ladder.id : null,
    key_result_id: ladder.kind === "key_result" ? ladder.id : null,
  };
}

// Goal mutations are open to the profile's coach AND to any manager: managers
// can add, edit, or delete a FAST goal for any team member (Dave, 2026-08-11).
async function canManageGoals(actor: TeamActor, profileId: string): Promise<boolean> {
  if (!profileId) return false;
  if (actor.role === "manager") {
    const { data } = await companyOs
      .from("coaching_profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    return Boolean(data);
  }
  return Boolean(await assertCoachOwnsProfile(actor, profileId));
}

async function goalProfileId(goalId: string): Promise<string | null> {
  if (!goalId) return null;
  const { data } = await companyOs
    .from("goals")
    .select("coaching_profile_id")
    .eq("id", goalId)
    .maybeSingle();
  return (data as { coaching_profile_id: string } | null)?.coaching_profile_id ?? null;
}

// The active coaching profile behind a team member, for surfaces (directory)
// that manage goals without being on the coach page.
export async function getCoachingProfileIdForMember(teamMemberId: string): Promise<string | null> {
  if (!teamMemberId) return null;
  const { data } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("active", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function coachAddGoal(
  actor: TeamActor,
  profileId: string,
  input: { title: string; status: GoalStatus; quarterLabel: string | null; ladder: LadderInput },
): Promise<Result> {
  if (!(await canManageGoals(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the goal first." };
  if (!(input.status in GOAL_STATUS_LABELS)) return { ok: false, error: "Bad status." };
  const { error } = await companyOs.from("goals").insert({
    coaching_profile_id: profileId,
    created_by: actor.teamMemberId,
    title,
    status: input.status,
    quarter_label: input.quarterLabel?.trim() || null,
    ...ladderColumns(input.ladder),
  });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

async function assertCoachOwnsRow(
  actor: TeamActor,
  table: "goals" | "coaching_priorities",
  id: string,
): Promise<boolean> {
  if (!id) return false;
  const { data } = await companyOs
    .from(table)
    .select("id, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return false;
  const prof = one(
    (data as unknown as Record<string, unknown>).coaching_profiles as
      | { coach_id: string }
      | { coach_id: string }[]
      | null,
  );
  return prof?.coach_id === actor.teamMemberId;
}

export async function coachUpdateGoal(
  actor: TeamActor,
  goalId: string,
  patch: { title?: string; status?: GoalStatus; quarterLabel?: string | null; ladder?: LadderInput },
): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The goal needs a title." };
    update.title = t;
  }
  if (patch.status !== undefined) {
    if (!(patch.status in GOAL_STATUS_LABELS)) return { ok: false, error: "Bad status." };
    update.status = patch.status;
  }
  if (patch.quarterLabel !== undefined) update.quarter_label = patch.quarterLabel?.trim() || null;
  if (patch.ladder !== undefined) Object.assign(update, ladderColumns(patch.ladder));
  const { error } = await companyOs.from("goals").update(update).eq("id", goalId);
  return error ? { ok: false, error: "Could not update the goal." } : { ok: true };
}

// True delete (comments cascade): a mis-set goal should not leave a tombstone.
// Coach of the profile or any manager.
export async function coachDeleteGoal(actor: TeamActor, goalId: string): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}

export async function coachAddPriority(
  actor: TeamActor,
  profileId: string,
  input: { title: string; detail: string; ladder: LadderInput },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the priority first." };
  const { count } = await companyOs
    .from("coaching_priorities")
    .select("id", { count: "exact", head: true })
    .eq("coaching_profile_id", profileId);
  const { error } = await companyOs.from("coaching_priorities").insert({
    coaching_profile_id: profileId,
    title,
    detail_markdown: input.detail.trim() || null,
    sort_order: count ?? 0,
    ...ladderColumns(input.ladder),
  });
  return error ? { ok: false, error: "Could not add the priority." } : { ok: true };
}

export async function coachUpdatePriority(
  actor: TeamActor,
  priorityId: string,
  patch: { title?: string; detail?: string; status?: PriorityStatus; ladder?: LadderInput },
): Promise<Result> {
  if (!(await assertCoachOwnsRow(actor, "coaching_priorities", priorityId)))
    return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The priority needs a title." };
    update.title = t;
  }
  if (patch.detail !== undefined) update.detail_markdown = patch.detail.trim() || null;
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "retired") return { ok: false, error: "Bad status." };
    update.status = patch.status;
  }
  if (patch.ladder !== undefined) Object.assign(update, ladderColumns(patch.ladder));
  const { error } = await companyOs.from("coaching_priorities").update(update).eq("id", priorityId);
  return error ? { ok: false, error: "Could not update the priority." } : { ok: true };
}

// OCEAN: coach writes; publish is the member-visibility gate (mirrors the
// shared-recap publish flow).
export type OceanInput = {
  dims: Record<OceanDimensionKey, { rating: string; evidence: string }>;
  snapshot: string;
  guidance: string;
};

export async function coachSaveOcean(
  actor: TeamActor,
  profileId: string,
  input: OceanInput,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const row: Record<string, unknown> = {
    snapshot_markdown: input.snapshot.trim() || null,
    guidance_markdown: input.guidance.trim() || null,
    updated_at: new Date().toISOString(),
  };
  for (const k of OCEAN_DIMENSIONS) {
    row[`${k}_rating`] = input.dims[k]?.rating.trim() || null;
    row[`${k}_evidence`] = input.dims[k]?.evidence.trim() || null;
  }
  const { data: existing } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  const { error } = existing
    ? await companyOs
        .from("coaching_ocean_profiles")
        .update(row)
        .eq("id", (existing as { id: string }).id)
    : await companyOs
        .from("coaching_ocean_profiles")
        .insert({ ...row, coaching_profile_id: profileId, published: false });
  return error ? { ok: false, error: "Could not save the OCEAN profile." } : { ok: true };
}

export async function coachPublishOcean(
  actor: TeamActor,
  profileId: string,
  publish: boolean,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id, snapshot_markdown, guidance_markdown")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Write the OCEAN profile first." };
  const r = data as { id: string; snapshot_markdown: string | null; guidance_markdown: string | null };
  if (publish && !r.snapshot_markdown?.trim() && !r.guidance_markdown?.trim())
    return { ok: false, error: "Write the snapshot or guidance before publishing." };
  const { error } = await companyOs
    .from("coaching_ocean_profiles")
    .update({ published: publish, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  return error ? { ok: false, error: "Could not update publishing." } : { ok: true };
}

export async function coachSetRetentionRoot(
  actor: TeamActor,
  profileId: string,
  root: RetentionRoot | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (root !== null && !(root in RETENTION_ROOT_LABELS)) return { ok: false, error: "Bad root." };
  return patchProfile(profileId, { retention_root: root });
}

// Attach a Lark Minutes link to a 1-1. The transcript pull itself is the
// cron's job (minutes_auto) or a later manual import; storing the token now
// keeps the meeting joined to its recording.
export async function coachSetMinutesLink(
  actor: TeamActor,
  meetingId: string,
  url: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const m = url.trim().match(/minutes\/([a-z0-9]+)/i);
  if (!m) return { ok: false, error: "Paste a Lark Minutes link (…/minutes/…)." };
  return patchMeeting(meetingId, { minutes_token: m[1], transcript_source: "minutes_link" });
}

export async function coachSetCadence(
  actor: TeamActor,
  profileId: string,
  cadenceDays: number,
  nextOneOnOneOn: string | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const days = Math.round(cadenceDays);
  if (!Number.isFinite(days) || days < 7 || days > 90)
    return { ok: false, error: "Cadence must be between 7 and 90 days." };
  if (nextOneOnOneOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextOneOnOneOn))
    return { ok: false, error: "Bad date." };
  return patchProfile(profileId, { cadence_days: days, next_one_on_one_on: nextOneOnOneOn });
}

export async function coachSetPrivateProfile(
  actor: TeamActor,
  profileId: string,
  markdown: string,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return patchProfile(profileId, { private_profile_markdown: markdown.trim() || null });
}

// Create a 1-1 row. `held` logs a meeting that already happened (transcript
// flow follows); `scheduled` books the next one and mirrors the date onto the
// profile so cadence math and the cron see it.
export async function coachCreateOneOnOne(
  actor: TeamActor,
  profileId: string,
  heldOn: string,
  status: Extract<OneOnOneStatus, "scheduled" | "held">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Bad date." };
  if (status !== "scheduled" && status !== "held") return { ok: false, error: "Bad status." };
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .insert({ coaching_profile_id: profileId, held_on: heldOn, status })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not create the 1-1." };
  if (status === "scheduled") await patchProfile(profileId, { next_one_on_one_on: heldOn });
  return { ok: true, id: (data as { id: string }).id };
}

// Meeting-scoped ownership: the meeting must belong to a profile this actor
// coaches. Returns { meeting, profileId } or null.
export async function assertCoachOwnsMeeting(
  actor: TeamActor,
  meetingId: string,
): Promise<{ meeting: OneOnOne; profileId: string } | null> {
  if (!meetingId) return null;
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select(`${MEETING_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", meetingId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  if (prof?.coach_id !== actor.teamMemberId) return null;
  return { meeting: toOneOnOne(r), profileId: r.coaching_profile_id as string };
}

// Save the transcript and mark the meeting held. The AI summary runs after
// this (lib/coaching/ai.ts); saving the raw transcript never blocks on it.
export async function coachSaveTranscript(
  actor: TeamActor,
  meetingId: string,
  transcript: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const text = transcript.trim();
  if (!text) return { ok: false, error: "Paste the transcript first." };
  if (text.length > 400_000) return { ok: false, error: "Transcript is too long." };
  // Transcript is stored on the linked meeting (call_transcripts), not on the
  // coaching row.
  const saved = await saveCoachingTranscript(meetingId, text);
  if (!saved.ok) return saved;
  return patchMeeting(meetingId, { status: "held" });
}

// Coach edits of the two summary tiers. Editing the shared recap does NOT
// publish it; publish is its own explicit action.
export async function coachSaveSummaries(
  actor: TeamActor,
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, {
    summary_markdown: summaryMarkdown.trim() || null,
    shared_summary_markdown: sharedSummaryMarkdown.trim() || null,
  });
}

// The publish gate: only after this does the member see the shared recap.
export async function coachPublishSharedRecap(
  actor: TeamActor,
  meetingId: string,
  publish: boolean,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (publish && !owned.meeting.sharedSummaryMarkdown?.trim())
    return { ok: false, error: "Write the shared recap before publishing." };
  return patchMeeting(meetingId, {
    shared_published_at: publish ? new Date().toISOString() : null,
  });
}

export async function coachArchiveMeeting(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, { archived_at: new Date().toISOString() });
}

export async function coachAddCommitment(
  actor: TeamActor,
  profileId: string,
  input: { title: string; owner: CommitmentOwner; dueOn: string | null; oneOnOneId?: string | null },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the commitment first." };
  if (title.length > 500) return { ok: false, error: "Keep the commitment under 500 characters." };
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) return { ok: false, error: "Bad date." };
  const owner: CommitmentOwner = input.owner === "coach" ? "coach" : "member";
  const { error } = await companyOs.from("coaching_commitments").insert({
    coaching_profile_id: profileId,
    one_on_one_id: input.oneOnOneId ?? null,
    title,
    owner,
    due_on: input.dueOn,
    created_by: actor.teamMemberId,
    sort_order: await nextCommitmentSort(profileId),
  });
  return error ? { ok: false, error: "Could not add the commitment." } : { ok: true };
}

// ---- commitment priority stack ----------------------------------------------
// One order per profile, written from either tier. The two entry points differ
// only in how they prove the actor may touch this profile.

// New commitments land at the bottom of the stack.
async function nextCommitmentSort(profileId: string): Promise<number> {
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("sort_order")
    .eq("coaching_profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data as { sort_order: number | null } | null)?.sort_order;
  return typeof top === "number" ? top + 1 : 0;
}

// Rewrite the stack from a client-supplied id list. The ids are the ONLY thing
// taken from the client, and every one of them must already belong to this
// profile — an id from another profile fails the whole call rather than
// silently reordering someone else's commitments.
async function applyCommitmentOrder(profileId: string, orderedIds: string[]): Promise<Result> {
  if (orderedIds.length === 0) return { ok: true };
  if (new Set(orderedIds).size !== orderedIds.length) return { ok: false, error: "Bad order." };
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .in("id", orderedIds);
  const mine = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  if (mine.size !== orderedIds.length) return { ok: false, error: "Not found." };
  const stamp = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      companyOs
        .from("coaching_commitments")
        .update({ sort_order: i, updated_at: stamp })
        .eq("id", id),
    ),
  );
  return results.some((r) => r.error) ? { ok: false, error: "Could not save the new order." } : { ok: true };
}

export async function coachReorderCommitments(
  actor: TeamActor,
  profileId: string,
  orderedIds: string[],
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return applyCommitmentOrder(profileId, orderedIds);
}

async function assertCoachOwnsCommitment(
  actor: TeamActor,
  commitmentId: string,
): Promise<Record<string, unknown> | null> {
  if (!commitmentId) return null;
  const { data } = await companyOs
    .from("coaching_commitments")
    .select(`${COMMITMENT_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", commitmentId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  return prof?.coach_id === actor.teamMemberId ? r : null;
}

export async function coachUpdateCommitment(
  actor: TeamActor,
  commitmentId: string,
  patch: { status?: CommitmentStatus; statusNote?: string; title?: string; dueOn?: string | null },
): Promise<Result> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The commitment needs a title." };
    update.title = t;
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn)) return { ok: false, error: "Bad date." };
    update.due_on = patch.dueOn;
  }
  if (patch.status !== undefined) {
    if (!(patch.status in COMMITMENT_STATUS_LABELS)) return { ok: false, error: "Bad status." };
    update.status = patch.status;
    update.status_updated_by = actor.teamMemberId;
    update.status_updated_at = new Date().toISOString();
    update.closed_at =
      patch.status === "completed" || patch.status === "dropped" ? new Date().toISOString() : null;
  }
  if (patch.statusNote !== undefined) update.status_note = patch.statusNote.trim() || null;
  const { error } = await companyOs.from("coaching_commitments").update(update).eq("id", commitmentId);
  return error ? { ok: false, error: "Could not update the commitment." } : { ok: true };
}

// Push a commitment onto a task board as a linked card. Idempotent: if a live
// card already links to this commitment, do nothing. Assignee is the coached
// person for a member commitment, the coach for a coach commitment.
export async function coachPushCommitmentToBoard(
  actor: TeamActor,
  commitmentId: string,
  boardId: string,
): Promise<Result & { created?: { assigneeId: string | null; title: string } }> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  if (!boardId) return { ok: false, error: "Pick a board." };
  // The board is the write boundary: only a member (or admin) may add a card,
  // exactly as every admin/team board mutation enforces. The actor is already
  // resolved here, so check membership directly (no session helper — this module
  // is reachable from client components and must not import next/headers).
  if (!actor.isAdmin) {
    const { data: mem } = await companyOs
      .from("board_members")
      .select("id")
      .eq("board_id", boardId)
      .eq("person_id", actor.personId)
      .maybeSingle();
    if (!mem) return { ok: false, error: "You are not a member of that board." };
  }

  const { data: existing } = await companyOs
    .from("tasks")
    .select("id")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .eq("subject_id", commitmentId)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return { ok: true };

  const { data: cols } = await companyOs
    .from("board_columns")
    .select("id, is_done, position")
    .eq("board_id", boardId)
    .order("position");
  const columns = (cols ?? []) as { id: string; is_done: boolean; position: number }[];
  if (columns.length === 0) return { ok: false, error: "That board has no columns." };
  const target = columns.find((c) => !c.is_done) ?? columns[0];

  const owner = row.owner as CommitmentOwner;
  const { data: prof } = await companyOs
    .from("coaching_profiles")
    .select("team_member_id, coach_id")
    .eq("id", row.coaching_profile_id as string)
    .maybeSingle();
  const p = prof as { team_member_id: string; coach_id: string } | null;
  const targetTm = owner === "coach" ? p?.coach_id : p?.team_member_id;
  let assigneeId: string | null = null;
  if (targetTm) {
    const { data: tm } = await companyOs.from("team_members").select("person_id").eq("id", targetTm).maybeSingle();
    assigneeId = (tm as { person_id: string } | null)?.person_id ?? null;
  }

  const { data: last } = await companyOs
    .from("tasks")
    .select("position")
    .eq("board_id", boardId)
    .eq("board_column_id", target.id)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? 0) + 1;

  const { error } = await companyOs.from("tasks").insert({
    board_id: boardId,
    board_column_id: target.id,
    title: row.title as string,
    assignee_id: assigneeId,
    due_date: (row.due_on as string | null) ?? null,
    priority: "p2",
    status: "open",
    subject_type: SUBJECT_COMMITMENT,
    subject_id: commitmentId,
    position,
  });
  if (error) return { ok: false, error: "Could not add the card." };
  return { ok: true, created: { assigneeId, title: row.title as string } };
}

// ---- member tier ------------------------------------------------------------
// Selects are FIXED member-visible column lists. Widening one is a security
// decision, not a tweak.

export type MemberRecap = {
  id: string;
  heldOn: string;
  sharedSummaryMarkdown: string;
  sharedPublishedAt: string;
  // The member's agenda going into THIS 1-1: talking points that existed and
  // were still open when the meeting was held. Reconstructed from
  // created_at/addressed_at, so a point carried across meetings appears under
  // each meeting it was open for.
  agenda: string[];
};

export type MyCoaching = {
  profileId: string;
  // Null when nobody coaches this profile yet (a profile can exist for its
  // owner's FAST goals alone).
  coachName: string | null;
  goals: CoachingGoal[];
  priorities: CoachingPriority[];
  // The member's own OCEAN profile — present ONLY when the coach published it.
  ocean: OceanProfile | null;
  cadenceDays: number;
  nextOneOnOneOn: string | null;
  commitments: Commitment[];
  talkingPoints: TalkingPoint[];
  recaps: MemberRecap[];
  checkins: Checkin[];
};

export async function getMyCoaching(actor: TeamActor): Promise<MyCoaching | null> {
  const { data } = await companyOs
    .from("coaching_profiles")
    .select("id, coach_id, cadence_days, next_one_on_one_on")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  const p = data as unknown as Record<string, unknown>;
  const profileId = p.id as string;

  // Coach display name via forward lookup (never the self-FK reverse embed).
  // coach_id is nullable: a profile can exist for its FAST goals alone, before
  // anyone coaches it. No coach means no name to resolve, not a failed query.
  const coachId = (p.coach_id as string | null) ?? null;
  const { data: coachRow } = coachId
    ? await companyOs
        .from("team_members")
        .select("people:people!person_id(full_name, preferred_name, email)")
        .eq("id", coachId)
        .maybeSingle()
    : { data: null };
  const coachPerson = one(
    ((coachRow as unknown as Record<string, unknown> | null)?.people ?? null) as
      | PersonEmbed
      | PersonEmbed[]
      | null,
  );

  const [recaps, commitments, talkingPoints, checkins, goals, priorities, ocean, edges] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("id, held_on, shared_summary_markdown, shared_published_at")
      .eq("coaching_profile_id", profileId)
      .is("archived_at", null)
      .not("shared_published_at", "is", null)
      .order("held_on", { ascending: false }),
    companyOs
      .from("coaching_commitments")
      .select(COMMITMENT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    // All points, addressed included: the open ones are the live agenda, and
    // the full set reconstructs each past meeting's agenda for the History tab.
    companyOs
      .from("coaching_talking_points")
      .select(TALKING_POINT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_checkins")
      .select("id, sent_at, message_markdown, responded_at")
      .eq("coaching_profile_id", profileId)
      .order("sent_at", { ascending: false }),
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .in("status", ["draft", "active", "achieved"])
      .order("sort_order")
      .order("created_at"),
    companyOs
      .from("coaching_priorities")
      .select(PRIORITY_SELECT)
      .eq("coaching_profile_id", profileId)
      .eq("status", "active")
      .order("sort_order"),
    // Member tier: the published gate lives IN the query, not in the view.
    companyOs
      .from("coaching_ocean_profiles")
      .select(OCEAN_SELECT)
      .eq("coaching_profile_id", profileId)
      .eq("published", true)
      .maybeSingle(),
    getEdgesLadderOptions(),
  ]);

  const myGoalRows = ((goals.data ?? []) as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
  const myGoalComments = await getGoalComments(myGoalRows.map((g) => g.id));

  const allPoints = ((talkingPoints.data ?? []) as unknown as Record<string, unknown>[]).map(toTalkingPoint);
  // The agenda going into a meeting held on day D (Saigon dates, UTC+7): points
  // raised before D ended and still open when D started. A point carried across
  // meetings was on each of those agendas, so it repeats; addressed_at is only
  // ever set around the meeting that covered it.
  const agendaFor = (heldOn: string): string[] => {
    const dayStart = Date.parse(`${heldOn}T00:00:00+07:00`);
    const dayEnd = Date.parse(`${heldOn}T23:59:59+07:00`);
    return allPoints
      .filter(
        (t) =>
          Date.parse(t.createdAt) <= dayEnd &&
          (t.addressedAt === null || Date.parse(t.addressedAt) >= dayStart),
      )
      .map((t) => t.body);
  };

  return {
    profileId,
    coachName: coachPerson ? displayName(coachPerson) : null,
    goals: attachComments(myGoalRows, myGoalComments),
    priorities: ((priorities.data ?? []) as unknown as Record<string, unknown>[]).map((x) => toPriority(x, edges)),
    ocean: ocean.data ? toOcean(ocean.data as unknown as Record<string, unknown>) : null,
    cadenceDays: (p.cadence_days as number) ?? 14,
    nextOneOnOneOn: (p.next_one_on_one_on as string | null) ?? null,
    commitments: ((commitments.data ?? []) as unknown as Record<string, unknown>[]).map(toCommitment),
    talkingPoints: allPoints.filter((t) => t.addressedAt === null),
    recaps: ((recaps.data ?? []) as unknown as Record<string, unknown>[])
      .filter((r) => (r.shared_summary_markdown as string | null)?.trim())
      .map((r) => ({
        id: r.id as string,
        heldOn: r.held_on as string,
        sharedSummaryMarkdown: r.shared_summary_markdown as string,
        sharedPublishedAt: r.shared_published_at as string,
        agenda: agendaFor(r.held_on as string),
      })),
    checkins: ((checkins.data ?? []) as unknown as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      sentAt: c.sent_at as string,
      messageMarkdown: c.message_markdown as string,
      respondedAt: (c.responded_at as string | null) ?? null,
    })),
  };
}

// ---- roster management ------------------------------------------------------
// Managers and existing coaches can add people to THEIR OWN roster (coach_id
// is always the actor, never client input). Adding someone whose profile was
// deactivated (contractor, alumni history) reactivates it under the new coach.

export type RosterCandidate = { teamMemberId: string; name: string; positionTitle: string | null };

export async function canManageRoster(actor: TeamActor): Promise<boolean> {
  if (actor.role === "manager") return true;
  return isCoach(actor);
}

export async function getRosterCandidates(actor: TeamActor): Promise<RosterCandidate[]> {
  if (!(await canManageRoster(actor))) return [];
  const [{ data: members }, { data: profiles }] = await Promise.all([
    companyOs
      .from("team_members")
      .select("id, status, people:people!person_id(full_name, preferred_name, email), positions:positions!position_id(title)")
      .in("status", ["active", "pre_start"]),
    companyOs.from("coaching_profiles").select("team_member_id").eq("active", true),
  ]);
  const coached = new Set(
    ((profiles ?? []) as { team_member_id: string }[]).map((p) => p.team_member_id),
  );
  return ((members ?? []) as unknown as Record<string, unknown>[])
    .filter((m) => (m.id as string) !== actor.teamMemberId && !coached.has(m.id as string))
    .map((m) => {
      const person = one((m.people ?? null) as PersonEmbed | PersonEmbed[] | null);
      const pos = one((m.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
      return { teamMemberId: m.id as string, name: displayName(person), positionTitle: pos?.title ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function coachAddToRoster(
  actor: TeamActor,
  teamMemberId: string,
  firstOneOnOne: string | null,
): Promise<Result> {
  if (!(await canManageRoster(actor))) return { ok: false, error: "Not allowed." };
  if (!teamMemberId) return { ok: false, error: "Pick a person first." };
  if (teamMemberId === actor.teamMemberId) return { ok: false, error: "You cannot coach yourself." };
  if (firstOneOnOne && !/^\d{4}-\d{2}-\d{2}$/.test(firstOneOnOne)) return { ok: false, error: "Bad date." };

  const { data: existing } = await companyOs
    .from("coaching_profiles")
    .select("id, active")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  const row = existing as { id: string; active: boolean } | null;
  if (row?.active) return { ok: false, error: "They are already in a coaching cycle." };
  if (row) {
    return patchProfile(row.id, {
      active: true,
      coach_id: actor.teamMemberId,
      next_one_on_one_on: firstOneOnOne,
    });
  }
  const { error } = await companyOs.from("coaching_profiles").insert({
    team_member_id: teamMemberId,
    coach_id: actor.teamMemberId,
    cadence_days: 14,
    next_one_on_one_on: firstOneOnOne,
    retention_root: "watching",
  });
  return error ? { ok: false, error: "Could not add them to the roster." } : { ok: true };
}

// ---- team-wide tier ---------------------------------------------------------
// FAST goals are Transparent (the T): any signed-in team member can read
// anyone's ACTIVE goals — title, status, quarter, and ladder only. Nothing
// else from the coaching tables crosses this boundary.

export type TeamMemberGoal = {
  goalId: string;
  title: string;
  status: GoalStatus;
  quarterLabel: string | null;
  ladderLabel: string | null;
  comments: GoalComment[];
};

export async function getTeamMemberActiveGoals(teamMemberId: string): Promise<TeamMemberGoal[]> {
  if (!teamMemberId) return [];
  const { data: prof } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (!prof) return [];
  const [{ data }, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", (prof as { id: string }).id)
      .eq("status", "active")
      .order("sort_order")
      .order("created_at"),
    getEdgesLadderOptions(),
  ]);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toGoal(r, edges));
  const comments = await getGoalComments(rows.map((g) => g.id));
  return rows.map((g) => ({
    goalId: g.id,
    title: g.title,
    status: g.status,
    quarterLabel: g.quarterLabel,
    ladderLabel: g.ladder?.label ?? null,
    comments: comments.get(g.id) ?? [],
  }));
}

// Member status update on a commitment on their OWN profile — status + note
// only, never title/due date/owner. Also stamps the latest unanswered check-in
// as responded, closing the mid-cycle loop.
export async function myUpdateCommitmentStatus(
  actor: TeamActor,
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  if (!(status in COMMITMENT_STATUS_LABELS)) return { ok: false, error: "Bad status." };
  const { data } = await companyOs
    .from("coaching_commitments")
    .select(
      "id, coaching_profile_id, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)",
    )
    .eq("id", commitmentId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Not found." };
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null);
  if (prof?.team_member_id !== actor.teamMemberId) return { ok: false, error: "Not found." };

  const { error } = await companyOs
    .from("coaching_commitments")
    .update({
      status,
      status_note: note.trim() || null,
      status_updated_by: actor.teamMemberId,
      status_updated_at: new Date().toISOString(),
      closed_at: status === "completed" || status === "dropped" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not update the commitment." };

  // Mark the newest unanswered check-in responded (fire-and-forget semantics).
  const profileId = r.coaching_profile_id as string;
  const { data: checkin } = await companyOs
    .from("coaching_checkins")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .is("responded_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (checkin) {
    await companyOs
      .from("coaching_checkins")
      .update({ responded_at: new Date().toISOString() })
      .eq("id", (checkin as { id: string }).id);
  }
  return { ok: true };
}

// The actor's own ACTIVE profile id, or null. The member tier's authorization
// subject: never a client-supplied profile id.
async function myProfileId(actor: TeamActor): Promise<string | null> {
  const { data } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// A commitment the actor WROTE on their own profile. Both halves matter: being
// the profile's owner grants status and order, but only authorship grants
// retitling and deletion, so a member can never edit what their coach set.
async function myAuthoredCommitment(
  actor: TeamActor,
  commitmentId: string,
): Promise<{ id: string; profileId: string } | null> {
  if (!commitmentId) return null;
  const profileId = await myProfileId(actor);
  if (!profileId) return null;
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("id, created_by")
    .eq("id", commitmentId)
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  const row = data as { id: string; created_by: string | null } | null;
  if (!row || row.created_by !== actor.teamMemberId) return null;
  return { id: row.id, profileId };
}

function validCommitmentInput(title: string, dueOn: string | null): Result {
  const t = title.trim();
  if (!t) return { ok: false, error: "Write the commitment first." };
  if (t.length > 500) return { ok: false, error: "Keep the commitment under 500 characters." };
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false, error: "Bad date." };
  return { ok: true };
}

// A member commits to their own work. owner is always "member" — a member
// cannot assign work to their coach from here.
export async function myAddCommitment(
  actor: TeamActor,
  input: { title: string; dueOn: string | null },
): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validCommitmentInput(input.title, input.dueOn);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_commitments").insert({
    coaching_profile_id: profileId,
    title: input.title.trim(),
    owner: "member",
    due_on: input.dueOn,
    created_by: actor.teamMemberId,
    sort_order: await nextCommitmentSort(profileId),
  });
  return error ? { ok: false, error: "Could not add the commitment." } : { ok: true };
}

export async function myUpdateCommitmentDetails(
  actor: TeamActor,
  commitmentId: string,
  input: { title: string; dueOn: string | null },
): Promise<Result> {
  if (!(await myAuthoredCommitment(actor, commitmentId)))
    return { ok: false, error: "You can only edit commitments you wrote." };
  const valid = validCommitmentInput(input.title, input.dueOn);
  if (!valid.ok) return valid;
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({
      title: input.title.trim(),
      due_on: input.dueOn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);
  return error ? { ok: false, error: "Could not update the commitment." } : { ok: true };
}

export async function myDeleteCommitment(actor: TeamActor, commitmentId: string): Promise<Result> {
  if (!(await myAuthoredCommitment(actor, commitmentId)))
    return { ok: false, error: "You can only delete commitments you wrote." };
  const { error } = await companyOs.from("coaching_commitments").delete().eq("id", commitmentId);
  return error ? { ok: false, error: "Could not delete the commitment." } : { ok: true };
}

// The member reorders the whole stack, including what their coach set: the
// order is the member's read on what matters most right now, and the coach
// sees the same list.
export async function myReorderCommitments(
  actor: TeamActor,
  orderedIds: string[],
): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  return applyCommitmentOrder(profileId, orderedIds);
}

// ---- talking points (the member's half of the 1-1 agenda) -------------------
// The member raises what they want to cover next time; the coach sees it before
// the meeting and it feeds the AI prep. Scope is the actor's OWN profile; a
// member deletes only what they wrote; either side may mark one addressed.

function validTalkingPoint(body: string): Result {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write the talking point first." };
  if (b.length > 500) return { ok: false, error: "Keep it under 500 characters." };
  return { ok: true };
}

export async function myAddTalkingPoint(actor: TeamActor, body: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validTalkingPoint(body);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_talking_points").insert({
    coaching_profile_id: profileId,
    author_team_member_id: actor.teamMemberId,
    body: body.trim(),
  });
  return error ? { ok: false, error: "Could not add the talking point." } : { ok: true };
}

export async function myDeleteTalkingPoint(actor: TeamActor, id: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId || !id) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_talking_points")
    .select("id, author_team_member_id")
    .eq("id", id)
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  const row = data as { id: string; author_team_member_id: string | null } | null;
  if (!row || row.author_team_member_id !== actor.teamMemberId)
    return { ok: false, error: "You can only delete talking points you wrote." };
  const { error } = await companyOs.from("coaching_talking_points").delete().eq("id", id);
  return error ? { ok: false, error: "Could not delete." } : { ok: true };
}

// Mark a talking point addressed (or reopen it): allowed for the profile's coach
// or the member who wrote it. Returns the profile id so the caller can revalidate
// the right page.
export async function setTalkingPointAddressed(
  actor: TeamActor,
  id: string,
  addressed: boolean,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_talking_points")
    .select("id, coaching_profile_id, author_team_member_id")
    .eq("id", id)
    .maybeSingle();
  const row = data as
    | { id: string; coaching_profile_id: string; author_team_member_id: string | null }
    | null;
  if (!row) return { ok: false, error: "Not found." };
  const isAuthor = row.author_team_member_id === actor.teamMemberId;
  const isCoach = Boolean(await assertCoachOwnsProfile(actor, row.coaching_profile_id));
  if (!isAuthor && !isCoach) return { ok: false, error: "Not allowed." };
  const { error } = await companyOs
    .from("coaching_talking_points")
    .update({ addressed_at: addressed ? new Date().toISOString() : null })
    .eq("id", id);
  return error
    ? { ok: false, error: "Could not update." }
    : { ok: true, profileId: row.coaching_profile_id };
}

// ---- member tier: my FAST goals (/team/goals) ------------------------------
// The member writes the same goals rows the coach page reads, so a
// goal set here shows up in the next 1-1 rather than in a parallel list. Scope
// is the actor's OWN profile (team_member_id = actor.teamMemberId, from the
// JWT-derived actor) — never coach_id, and never a client-supplied profile id.

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

function goalColumns(input: MyGoalInput): Record<string, unknown> {
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

function validateGoal(input: MyGoalInput): string | null {
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

// ---- Admin goal management ----------------------------------------------
// The admin Company section (/admin/company/goals) lets an admin edit ANY
// member's FAST goals. These functions do no authorization of their own: the
// only caller is the admin action, which gates on requireAdmin() first. They
// must never be reached from a team-tier path. Column shaping and validation
// reuse the same goalColumns/validateGoal as the member's own writes, so an
// admin edit and a self-edit produce identical rows.

// The member's active coaching profile, created if they have none — the admin
// analogue of getOrCreateMyCoachingProfileId, keyed by team_member_id rather
// than the actor.
async function getOrCreateProfileIdForMember(
  teamMemberId: string,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!teamMemberId) return { ok: false, error: "No team member." };
  const { data: existing } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (existing) return { ok: true, profileId: (existing as { id: string }).id };

  const { data: me } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", teamMemberId)
    .maybeSingle();
  const managerId = (me as { manager_id: string | null } | null)?.manager_id ?? null;

  const { data: created, error } = await companyOs
    .from("coaching_profiles")
    .insert({ team_member_id: teamMemberId, coach_id: managerId })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "Could not start this member's goals. Try again." };
  return { ok: true, profileId: (created as { id: string }).id };
}

export type AdminMemberGoals = {
  teamMemberId: string;
  name: string;
  goals: CoachingGoal[];
};

// Every active employee with their FAST goals, for the admin editor. Same
// roster shape as the company-goals rollup (employees only), but carrying the
// goal ids and measures the editor needs.
export async function getAdminRosterGoals(): Promise<{ members: AdminMemberGoals[]; edges: EdgesOptions }> {
  const [rosterRes, edges] = await Promise.all([
    companyOs
      .from("team_members")
      .select(
        "id, people:people!person_id(full_name, preferred_name), " +
          "coaching_profiles:coaching_profiles!team_member_id(id, active)",
      )
      .eq("status", "active")
      .neq("employment_type", "contract"),
    getEdgesLadderOptions(),
  ]);

  type Name = { full_name: string | null; preferred_name: string | null };
  type Prof = { id: string; active: boolean };
  const roster = (rosterRes.data ?? []) as unknown as Record<string, unknown>[];

  // profile id -> owning member, so goals fetched by profile group back to the
  // right person (a member may hold more than one profile over time).
  const profileToMember = new Map<string, string>();
  const members = roster.map((r) => {
    const person = one(r.people as Name | Name[] | null);
    const name = person?.preferred_name || person?.full_name || "Unknown";
    const profs = ((): Prof[] => {
      const p = r.coaching_profiles as Prof | Prof[] | null;
      return Array.isArray(p) ? p : p ? [p] : [];
    })();
    for (const p of profs) profileToMember.set(p.id, r.id as string);
    return { teamMemberId: r.id as string, name };
  });

  const profileIds = Array.from(profileToMember.keys());
  const goalsRes = profileIds.length
    ? await companyOs
        .from("goals")
        .select(GOAL_SELECT)
        .in("coaching_profile_id", profileIds)
        .order("sort_order")
        .order("created_at")
    : { data: [] as unknown[] };

  const goalsByMember = new Map<string, CoachingGoal[]>();
  for (const row of (goalsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const memberId = profileToMember.get(row.coaching_profile_id as string);
    if (!memberId) continue;
    goalsByMember.set(memberId, [...(goalsByMember.get(memberId) ?? []), toGoal(row, edges)]);
  }

  return {
    members: members
      .map((m) => ({ ...m, goals: goalsByMember.get(m.teamMemberId) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    edges,
  };
}

export async function adminAddGoal(teamMemberId: string, input: MyGoalInput): Promise<Result> {
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const profile = await getOrCreateProfileIdForMember(teamMemberId);
  if (!profile.ok) return { ok: false, error: profile.error };

  const { error } = await companyOs.from("goals").insert({
    coaching_profile_id: profile.profileId,
    // created_by names the team member whose goal it is, matching a self-add:
    // the admin is the actor, but the goal belongs to the member.
    created_by: teamMemberId,
    ...goalColumns(input),
  });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

export async function adminUpdateGoal(goalId: string, input: MyGoalInput): Promise<Result> {
  if (!goalId) return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await companyOs
    .from("goals")
    .update({ ...goalColumns(input), updated_at: new Date().toISOString() })
    .eq("id", goalId);
  return error ? { ok: false, error: "Could not save the goal." } : { ok: true };
}

export async function adminDeleteGoal(goalId: string): Promise<Result> {
  if (!goalId) return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}
