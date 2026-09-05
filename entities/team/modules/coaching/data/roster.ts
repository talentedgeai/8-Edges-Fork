import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { saigonToday, diffDays } from "@/kernel/config/dates";
import { OPEN_COMMITMENT_STATUSES, type RetentionRoot } from "../types";
import { displayName, toMember, type CoachingMember, type PersonEmbed } from "./rows";
import { PROFILE_SELECT, patchProfile, type ModeSplit, type Result } from "./shared";

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
