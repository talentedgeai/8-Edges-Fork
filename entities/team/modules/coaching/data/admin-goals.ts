import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { type CoachingGoal, type EdgesOptions, type AdminMemberGoals } from "../types";
import { GOAL_SELECT, getEdgesLadderOptions, toGoal } from "./goals";
import { goalColumns, type MyGoalInput, validateGoal } from "./my-goals";
import { type Result } from "./shared";

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
