// Server-only auth gate for the /team self-service portal. The mirror of
// lib/admin-auth.ts, but for employees and managers instead of admins.
//
// SECURITY MODEL (see docs/plans/2026-07-05-team-portal-design.md):
// company_os has RLS enabled with NO policies and NO grants to the browser key,
// so the publishable key can read nothing there. All /team data goes through the
// service-role client (lib/supabase.ts) exactly like /admin. This gate is the
// ONLY boundary, so every /team page and server action must call
// requireTeamMember() first AND scope every query to the actor's own ids (use
// lib/team/data.ts). Identity is matched on people.auth_user_id (the cryptographic
// id from the JWT), NEVER on email, which is mutable/reusable.

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/kernel/data/supabase/server";
import { companyOs } from "@/kernel/data/supabase";
import { isAdminEmail } from "@/kernel/identity/admin-auth";
import { actorDisplayName } from "@/kernel/config/people-name";

export type TeamRole = "employee" | "manager";

export type TeamActor = {
  authUserId: string;
  personId: string;
  teamMemberId: string;
  role: TeamRole;
  displayName: string;
  avatarUrl: string | null;
  // Auth email, lowercased. Identity/scope is NEVER keyed on this (see the id
  // rationale below); it exists only to reuse the email-keyed sensitive-data
  // gate (canViewSensitive) for privileged read access like reviews.
  email: string;
  // Scope sets, computed server-side from the JWT — never from client input.
  // Employees: just their own id. Managers: own id + active direct reports.
  teamMemberScope: string[]; // team_members.id values this actor may read
  personScope: string[]; // people.id values this actor may read
  directReportIds: string[]; // team_members.id of direct reports (managers only)
  // True if this same person is also an admin. Used only by the sidebar's
  // Admin/Team view switcher — never grants extra scope within /team.
  isAdmin: boolean;
};

// team_members.status values that grant portal access. Candidates (recruiting),
// terminated, and alumni are denied; pre_start is allowed so new hires can do
// onboarding before day one. Exported so provisioning refuses to invite anyone
// the gate would turn away.
export const PORTAL_STATUSES = ["active", "on_leave", "notice", "pre_start"];

type GetActorResult =
  | { actor: TeamActor; redirectTo?: undefined }
  | { actor: null; redirectTo: "/admin" | "/team/login" };

type TeamMembershipLookup = {
  person: { id: string; full_name: string | null; first_name: string | null; preferred_name: string | null; email: string; avatar_url: string | null };
  membership: { id: string; status: string };
};

// Identity by auth_user_id, never by email. Shared by getTeamActor() and the
// Admin sidebar's "Team" switch-view eligibility check — wrapped in cache() so
// those two callers in one render pass share a single people+team_members lookup.
const findActiveTeamMembership = cache(async (authUserId: string): Promise<TeamMembershipLookup | null> => {
  const { data: person } = await companyOs
    .from("people")
    .select("id, full_name, first_name, preferred_name, email, avatar_url")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!person) return null;

  // Active employment record. A person may have several engagements; prefer an
  // 'active' one, else the first portal-eligible row.
  const { data: memberships } = await companyOs
    .from("team_members")
    .select("id, status")
    .eq("person_id", person.id)
    .in("status", PORTAL_STATUSES);
  const rows = (memberships ?? []) as { id: string; status: string }[];
  const membership = rows.find((r) => r.status === "active") ?? rows[0];
  if (!membership) return null;

  return { person, membership };
});

// True if the signed-in admin also has a linked, active team_members record —
// i.e. whether the Admin sidebar's "Team" view switch is live for them.
export async function hasTeamAccess(authUserId: string): Promise<boolean> {
  return Boolean(await findActiveTeamMembership(authUserId));
}

// Resolve the signed-in user to a team actor. Returns a redirect target instead
// of an actor when the caller is not a portal user:
//   - not signed in                                       -> /team/login
//   - no linked, active team_members record, is an admin   -> /admin
//   - no linked, active team_members record, not an admin  -> /team/login
// An admin WITH a linked team_members record is a valid team actor — they
// deliberately switched into /team via the sidebar and use their own team
// scope, same as anyone else. Admin status never widens that scope.
export const getTeamActor = cache(async (): Promise<GetActorResult> => {
  const supabase = createSessionClient();
  // Revalidates the JWT against GoTrue here rather than trusting middleware to
  // have done it: the matcher does not cover /api, and /api/team/chat calls this
  // gate. Identity is still matched on the cryptographic auth_user_id below,
  // never on email. See getAdminUser() for the full rationale.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return { actor: null, redirectTo: "/team/login" };

  const found = await findActiveTeamMembership(user.id);
  if (!found) {
    if (await isAdminEmail(email)) return { actor: null, redirectTo: "/admin" };
    return { actor: null, redirectTo: "/team/login" };
  }
  const { person, membership } = found;
  const isAdmin = await isAdminEmail(email);

  // Manager iff at least one active team member reports to this one.
  const { data: reports } = await companyOs
    .from("team_members")
    .select("id, person_id")
    .eq("manager_id", membership.id)
    .in("status", PORTAL_STATUSES);
  const reportRows = (reports ?? []) as { id: string; person_id: string }[];
  const isManager = reportRows.length > 0;

  const directReportIds = reportRows.map((r) => r.id);
  const teamMemberScope = [membership.id, ...directReportIds];
  const personScope = [person.id, ...reportRows.map((r) => r.person_id)];

  return {
    actor: {
      authUserId: user.id,
      personId: person.id,
      teamMemberId: membership.id,
      role: isManager ? "manager" : "employee",
      displayName: actorDisplayName(person),
      avatarUrl: person.avatar_url,
      email,
      teamMemberScope,
      personScope,
      directReportIds,
      isAdmin,
    },
  };
});

// Gate for /team pages and server actions. Redirects when the caller has no
// team identity. Call at the top of the /team layout and EVERY /team action.
export async function requireTeamMember(): Promise<TeamActor> {
  const { actor, redirectTo } = await getTeamActor();
  if (!actor) redirect(redirectTo);
  return actor;
}
