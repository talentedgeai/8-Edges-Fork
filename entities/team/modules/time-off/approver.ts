// "Who approves this person's leave?" — one answer, used by every surface that
// routes or gates a leave decision (docs/plans/2026-08-12-client-manager-time-off-approval.md).
//
// Edge8 staff placed at a client are managed day to day by someone at the
// client. The order is: the client manager named on their active placement,
// else their Edge8 manager, else nobody. Approval power comes from being that
// named client manager, never from a portal role — a client admin with no
// placements naming them decides nothing.

import { companyOs } from "@/kernel/data/supabase";

export type LeaveApprover = {
  kind: "client" | "edge8";
  personId: string;
  email: string;
  displayName: string;
  // Set only for kind "client": the company whose placement names them.
  companyId: string | null;
};

type PersonRow = {
  id: string;
  email: string;
  preferred_name: string | null;
  first_name: string | null;
  full_name: string | null;
};

function displayNameOf(p: PersonRow): string {
  return p.preferred_name || p.full_name || p.first_name || p.email;
}

async function person(id: string | null): Promise<PersonRow | null> {
  if (!id) return null;
  const { data } = await companyOs
    .from("people")
    .select("id, email, preferred_name, first_name, full_name")
    .eq("id", id)
    .maybeSingle();
  return (data as PersonRow | null) ?? null;
}

// The client manager named on this member's active placement, if any. A member
// placed at two clients at once is not a case we have; if it ever happens the
// oldest active placement wins, deterministically.
async function clientManagerFor(
  teamMemberId: string,
): Promise<{ personId: string; companyId: string } | null> {
  const { data } = await companyOs
    .from("staff_assignments")
    .select("client_manager_person_id, company_id")
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const row = ((data ?? []) as { client_manager_person_id: string | null; company_id: string }[])[0];
  if (!row?.client_manager_person_id) return null;
  return { personId: row.client_manager_person_id, companyId: row.company_id };
}

export async function resolveLeaveApprover(teamMemberId: string): Promise<LeaveApprover | null> {
  const client = await clientManagerFor(teamMemberId);
  if (client) {
    const p = await person(client.personId);
    if (p?.email) {
      return {
        kind: "client",
        personId: p.id,
        email: p.email,
        displayName: displayNameOf(p),
        companyId: client.companyId,
      };
    }
  }

  const { data: member } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", teamMemberId)
    .maybeSingle();
  const managerId = (member as { manager_id: string | null } | null)?.manager_id ?? null;
  if (!managerId) return null;

  const { data: mgr } = await companyOs
    .from("team_members")
    .select("person_id")
    .eq("id", managerId)
    .maybeSingle();
  const p = await person((mgr as { person_id: string | null } | null)?.person_id ?? null);
  if (!p?.email) return null;
  return { kind: "edge8", personId: p.id, email: p.email, displayName: displayNameOf(p), companyId: null };
}

// Other people to keep in the loop on a client-approved request: the client's
// active portal admins (visibility only, they cannot decide). Excludes the
// approver themselves. Empty for Edge8-approved leave.
export async function clientWatcherEmails(approver: LeaveApprover): Promise<string[]> {
  if (approver.kind !== "client" || !approver.companyId) return [];

  const { data } = await companyOs
    .from("portal_members")
    .select("person_id")
    .eq("company_id", approver.companyId)
    .eq("status", "active")
    .eq("role", "admin");
  const ids = ((data ?? []) as { person_id: string }[])
    .map((r) => r.person_id)
    .filter((id) => id !== approver.personId);
  if (ids.length === 0) return [];

  const { data: people } = await companyOs.from("people").select("email").in("id", ids);
  return ((people ?? []) as { email: string | null }[])
    .map((p) => p.email)
    .filter((e): e is string => !!e);
}

// The team_member ids whose active placement names this person as client
// manager, restricted to companies the caller already has in scope. The gate
// for every client-side decision: scope first, then the request id.
export async function teamMemberIdsManagedBy(
  personId: string,
  companyScope: string[],
): Promise<string[]> {
  if (companyScope.length === 0) return [];
  const { data } = await companyOs
    .from("staff_assignments")
    .select("team_member_id")
    .eq("client_manager_person_id", personId)
    .eq("status", "active")
    .in("company_id", companyScope);
  const rows = (data ?? []) as { team_member_id: string }[];
  return [...new Set(rows.map((r) => r.team_member_id))];
}
