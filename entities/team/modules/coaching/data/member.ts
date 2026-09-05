import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { COMMITMENT_STATUS_LABELS, type GoalStatus, type CommitmentStatus, type GoalComment, type CoachingGoal } from "../types";
import { applyCommitmentOrder, nextCommitmentSort } from "./commitments";
import { GOAL_SELECT, OCEAN_SELECT, PRIORITY_SELECT, attachComments, getEdgesLadderOptions, getGoalComments, toGoal, toOcean, toPriority, type CoachingPriority, type OceanProfile } from "./goals";
import { TALKING_POINT_SELECT, toTalkingPoint, type Checkin, type TalkingPoint } from "./profile";
import { COMMITMENT_SELECT, displayName, toCommitment, type Commitment, type PersonEmbed } from "./rows";
import { type Result } from "./shared";

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
export async function myProfileId(actor: TeamActor): Promise<string | null> {
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
