import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { type RetentionRoot, type OneOnOneStatus, type CoachingGoal, type EdgesOptions } from "../types";
import { GOAL_SELECT, OCEAN_SELECT, PRIORITY_SELECT, attachComments, getEdgesLadderOptions, getGoalComments, toGoal, toOcean, toPriority, type CoachingPriority, type OceanProfile } from "./goals";
import { COMMITMENT_SELECT, toCommitment, toMember, type CoachingMember, type Commitment } from "./rows";
import { assertCoachOwnsProfile, coachBoards, loadCommitmentCards, type CommitmentCard, type ModeSplit } from "./shared";

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

export const MEETING_SELECT =
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

export function toOneOnOne(r: Record<string, unknown>): OneOnOne {
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

export const TALKING_POINT_SELECT = "id, body, author_team_member_id, addressed_at, created_at";

export function toTalkingPoint(r: Record<string, unknown>): TalkingPoint {
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
