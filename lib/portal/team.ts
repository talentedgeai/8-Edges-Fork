// Client-visible team roster. Like lib/team/data.ts's directory helper, this is
// a dedicated, reviewed function with an explicit safe-column contract rather
// than a generic scope-allowlist entry — team_directory carries leave balances
// and other fields a client must never see, so no /portal code may select it
// wholesale. The scope itself is two-step (assignments -> derived team_member
// ids), which the generic portalRead() column filter can't express either.

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { portalRead } from "@/lib/portal/data";

export type PortalTeamMember = {
  teamMemberId: string;
  fullName: string | null;
  roleTitle: string | null; // client-visible label from the assignment, not the internal position
  positionTitle: string | null;
  location: string | null;
  workSchedule: string | null;
  startDate: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  city: string | null;
  stateProvince: string | null;
  country: string | null;
};

type DirectoryRow = {
  id: string;
  person_id: string | null;
  full_name: string | null;
  position_title: string | null;
  location: string | null;
  work_schedule: string | null;
  start_date: string | null;
};

// Contact fields don't live on team_directory (it's built for org/leave
// context, not directory contact info) — joined separately from people. All
// still directory-safe: no compensation, no legal/HR fields.
type PersonContactRow = {
  id: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
};

// Entitlement check for nav/module visibility (design doc: "Team visible iff
// any company in scope has an active staff_assignments row"). Cheap existence
// check, separate from the full fetch so the sidebar doesn't have to load and
// discard the whole roster just to decide whether to show a link.
export async function hasAssignedStaff(actor: PortalActor): Promise<boolean> {
  if (actor.companyScope.length === 0) return false;
  const { data } = await portalRead(actor, "staff_assignments", "id")
    .eq("status", "active")
    .eq("client_visible", true)
    .limit(1);
  return (data ?? []).length > 0;
}

// The assigned team_member ids for the actor's company scope — the shared
// derivation step other /portal modules need before reading team-scoped data
// (e.g. lib/portal/time-off.ts). Time Off's scope is "assigned staff", not a
// direct company_id column, so this two-step lookup is required there too.
export async function getAssignedTeamMemberIds(actor: PortalActor): Promise<string[]> {
  if (actor.companyScope.length === 0) return [];
  const { data } = await portalRead(actor, "staff_assignments", "team_member_id")
    .eq("status", "active")
    .eq("client_visible", true);
  const rows = (data ?? []) as unknown as { team_member_id: string }[];
  return [...new Set(rows.map((r) => r.team_member_id))];
}

export async function getAssignedTeam(actor: PortalActor): Promise<PortalTeamMember[]> {
  if (actor.companyScope.length === 0) return [];

  const { data: assignmentRows } = await portalRead(
    actor,
    "staff_assignments",
    "team_member_id, role_title",
  )
    .eq("status", "active")
    .eq("client_visible", true);
  const assignments = (assignmentRows ?? []) as unknown as {
    team_member_id: string;
    role_title: string | null;
  }[];
  if (assignments.length === 0) return [];

  const roleByMemberId = new Map(assignments.map((a) => [a.team_member_id, a.role_title]));
  const memberIds = [...roleByMemberId.keys()];

  // Fixed safe column list only — never leave balances, employee_number,
  // manager chain, legal entity, or leave policy.
  const { data } = await companyOs
    .from("team_directory")
    .select("id, person_id, full_name, position_title, location, work_schedule, start_date")
    .in("id", memberIds);
  const rows = (data ?? []) as DirectoryRow[];

  const personIds = rows.map((r) => r.person_id).filter((id): id is string => !!id);
  const { data: peopleData } = personIds.length
    ? await companyOs
        .from("people")
        .select("id, email, phone, avatar_url, city, state_province, country")
        .in("id", personIds)
    : { data: [] as PersonContactRow[] };
  const contactByPersonId = new Map(
    ((peopleData ?? []) as PersonContactRow[]).map((p) => [p.id, p]),
  );

  return rows
    .map((r) => {
      const contact = r.person_id ? contactByPersonId.get(r.person_id) : undefined;
      return {
        teamMemberId: r.id,
        fullName: r.full_name,
        roleTitle: roleByMemberId.get(r.id) ?? null,
        positionTitle: r.position_title,
        location: r.location,
        workSchedule: r.work_schedule,
        startDate: r.start_date,
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
        avatarUrl: contact?.avatar_url ?? null,
        city: contact?.city ?? null,
        stateProvince: contact?.state_province ?? null,
        country: contact?.country ?? null,
      };
    })
    .sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
}
