import { companyOs } from "@/kernel/data/supabase";
import { mustCount } from "@/kernel/data/read";
import { getLeaveSpansByMember } from "./leave";
import type { LeaveSpan } from "../leave-window";
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { nextWeekdayOnOrAfter } from "../cadence";
import { displayName, toMember, type CoachingMember, type PersonEmbed } from "./rows";
import { getRosterFacts, NO_FACTS, type RosterFacts } from "./roster-facts";
import { PROFILE_SELECT, patchProfile, type Result } from "./shared";

// The first active FAST goal with the numbers the roster reads out loud. The
// roster shows one goal, not all of them: the page is read before a 1-1, and a
// list of goals is a profile, not a row.
export type RosterGoal = {
  title: string;
  currentValue: number | null;
  targetValue: number | null;
  metricUnit: string | null;
  // When the goal's row last changed, which for a FAST goal is almost always
  // its number being bumped — that is the only field either side edits often.
  updatedAt: string | null;
};

export type CoachRosterRow = {
  profileId: string;
  member: CoachingMember;
  goal: RosterGoal | null;
  nextOneOnOneOn: string | null;
  // A date the member proposed and the coach has not answered yet (K.32), and
  // who put it forward — only a member's proposal is waiting on the coach.
  proposedOn: string | null;
  proposedBy: string | null;
  // True when the booking on nextOneOnOneOn already carries an agenda, in
  // either tier: the coach's own prep, or the half the member can see.
  agendaWritten: boolean;
  // The most recent booking whose day passed without the 1-1 happening (K.36),
  // and the row it sits on — the roster's "Mark it held" writes to that row
  // (K.57), so the id travels with the date rather than being looked up again.
  missedOn: string | null;
  missedMeetingId: string | null;
  lastHeldOn: string | null;
  heldCount: number;
  // What moved since the last held 1-1, and how long anything has been stuck.
  facts: RosterFacts;
  // When this person is away (L.2). The roster needs it so a 1-1 missed over a
  // holiday neither appears in the help list nor puts "Mark it held" in front
  // of the coach as the thing to do about it.
  leave: LeaveSpan[];
};

// True if the actor coaches at least one active profile — drives the sidebar
// entry and the /team/coaching gate. Coaching is granted by rows, not role:
// a dotted-line coach may not be anyone's org-chart manager.
export async function isCoach(actor: TeamActor): Promise<boolean> {
  // A capability, so a failed read must not answer "no" (A.12). This feeds
  // canManageRoster, which the team layout uses to decide whether the Coaching
  // section appears at all.
  return mustCount(
    await companyOs
      .from("coaching_profiles")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", actor.teamMemberId)
      .eq("active", true),
    "[team/coaching/roster] coaching_profiles (isCoach)",
  ) > 0;
}

// The coach's roster with everything the dashboard cards need. One query per
// table, joined in memory — the roster is a handful of people, not a feed.
export async function getCoachRoster(actor: TeamActor): Promise<CoachRosterRow[]> {
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select(PROFILE_SELECT)
    .eq("coach_id", actor.teamMemberId)
    .eq("active", true);
  if (dataError) console.error("[team/coaching/roster] coaching_profiles", dataError);
  const profiles = ((data ?? []) as unknown as Record<string, unknown>[]);
  if (profiles.length === 0) return [];
  const ids = profiles.map((p) => p.id as string);

  const [meetingsRes, scheduledRes, goalsRes] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("coaching_profile_id, held_on, status")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .eq("status", "held"),
    // Every live booking in one read: the ones the daily pass stamped as
    // missed (K.36) and the one on the profile's next date, whose agenda the
    // roster reports. Two queries over the same rows would only be two ways to
    // disagree about them.
    companyOs
      .from("coaching_one_on_ones")
      .select("id, coaching_profile_id, held_on, missed_at, prep_markdown, prep_shared_markdown")
      .in("coaching_profile_id", ids)
      .eq("status", "scheduled")
      .is("archived_at", null)
      .order("held_on", { ascending: false }),
    companyOs
      .from("goals")
      // No sort_order: nothing has ever written it for goals, so ordering on
      // it ordered by a column of zeroes (K.13). created_at is the real order.
      .select("coaching_profile_id, title, status, current_value, target_value, metric_unit, updated_at")
      .in("coaching_profile_id", ids)
      .eq("status", "active")
      .order("created_at"),
  ]);
  if (scheduledRes.error) console.error("[team/coaching/roster] coaching_one_on_ones", scheduledRes.error);

  const lastHeld = new Map<string, string>();
  const heldCount = new Map<string, number>();
  for (const m of (meetingsRes.data ?? []) as Array<{ coaching_profile_id: string; held_on: string }>) {
    heldCount.set(m.coaching_profile_id, (heldCount.get(m.coaching_profile_id) ?? 0) + 1);
    const cur = lastHeld.get(m.coaching_profile_id);
    if (!cur || m.held_on > cur) lastHeld.set(m.coaching_profile_id, m.held_on);
  }
  // The first active goal per profile, which is what the row reads out; rows
  // arrive in created_at order, so the first one seen is the oldest.
  const leadGoal = new Map<string, RosterGoal>();
  for (const g of (goalsRes.data ?? []) as Array<{
    coaching_profile_id: string;
    title: string;
    current_value: number | null;
    target_value: number | null;
    metric_unit: string | null;
    updated_at: string | null;
  }>) {
    if (!leadGoal.has(g.coaching_profile_id)) {
      leadGoal.set(g.coaching_profile_id, {
        title: g.title,
        currentValue: g.current_value,
        targetValue: g.target_value,
        metricUnit: g.metric_unit,
        updatedAt: g.updated_at,
      });
    }
  }
  // The most recent unanswered miss per profile (rows arrive newest-first):
  // one prompt on the row, about the meeting in front of the coach. The same
  // pass records, per booking day, whether an agenda has been written.
  const missedOn = new Map<string, { heldOn: string; meetingId: string }>();
  const agendaOn = new Map<string, boolean>();
  for (const m of (scheduledRes.data ?? []) as Array<{
    id: string;
    coaching_profile_id: string;
    held_on: string;
    missed_at: string | null;
    prep_markdown: string | null;
    prep_shared_markdown: string | null;
  }>) {
    if (m.missed_at && !missedOn.has(m.coaching_profile_id))
      missedOn.set(m.coaching_profile_id, { heldOn: m.held_on, meetingId: m.id });
    const written = Boolean(m.prep_markdown?.trim() || m.prep_shared_markdown?.trim());
    agendaOn.set(`${m.coaching_profile_id}:${m.held_on}`, written);
  }

  const facts = await getRosterFacts(
    profiles.map((p) => ({
      profileId: p.id as string,
      personId: toMember(p).personId ?? "",
      lastHeldOn: lastHeld.get(p.id as string) ?? null,
    })),
  );
  // One query for everybody on the roster rather than one each (L.2).
  const leaveByMember = await getLeaveSpansByMember(
    profiles.map((p) => (p.team_member_id as string) ?? "").filter(Boolean),
    saigonToday(),
  );

  const rows = profiles.map((p) => {
    const id = p.id as string;
    const last = lastHeld.get(id) ?? null;
    const missed = missedOn.get(id);
    const nextOn = (p.next_one_on_one_on as string | null) ?? null;
    return {
      profileId: id,
      member: toMember(p),
      goal: leadGoal.get(id) ?? null,
      nextOneOnOneOn: nextOn,
      proposedOn: (p.proposed_one_on_one_on as string | null) ?? null,
      proposedBy: (p.proposed_by as string | null) ?? null,
      agendaWritten: nextOn ? (agendaOn.get(`${id}:${nextOn}`) ?? false) : false,
      missedOn: missed?.heldOn ?? null,
      missedMeetingId: missed?.meetingId ?? null,
      lastHeldOn: last,
      heldCount: heldCount.get(id) ?? 0,
      facts: facts.get(id) ?? NO_FACTS,
      leave: leaveByMember.get(p.team_member_id as string) ?? [],
    };
  });
  return rows.sort((a, b) => a.member.name.localeCompare(b.member.name));
}

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

  const { data: existing, error: existingError } = await companyOs
    .from("coaching_profiles")
    .select("id, active, preferred_weekday")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (existingError) console.error("[team/coaching/roster] coaching_profiles", existingError);
  const row = existing as { id: string; active: boolean; preferred_weekday: number | null } | null;
  if (row?.active) return { ok: false, error: "They are already in a coaching cycle." };
  if (row) {
    // A profile that already carries a preferred weekday (K.34) lands its first
    // 1-1 on that day when the coach names none; a date the coach typed wins.
    const first =
      firstOneOnOne ?? (row.preferred_weekday !== null ? nextWeekdayOnOrAfter(saigonToday(), row.preferred_weekday) : null);
    return patchProfile(row.id, {
      active: true,
      coach_id: actor.teamMemberId,
      next_one_on_one_on: first,
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
