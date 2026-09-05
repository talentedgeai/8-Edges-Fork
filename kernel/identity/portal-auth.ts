// Server-only auth gate for the /portal client surface. The third sibling of
// lib/admin-auth.ts (admins) and lib/team-auth.ts (employees), for external
// client contacts.
//
// SECURITY MODEL (see docs/plans/2026-07-11-client-portal-design.md):
// company_os has RLS enabled with NO policies and NO grants to the browser key,
// so the publishable key can read nothing there. All /portal data goes through
// the service-role client behind this gate. Portal users are EXTERNAL parties,
// so this boundary matters even more than /team: every /portal page and server
// action must call requirePortalMember() first AND scope every query through
// entities/portal/lib/data.ts. Identity is matched on people.auth_user_id (the
// cryptographic id from the JWT), NEVER on email, which is mutable/reusable.
//
// Access is an explicit allowlist: a person may log in iff they hold at least
// one active company_os.portal_members row. CRM links (person_companies) never
// grant access by themselves.
//
// ADMIN "ASSUME" (view a client's portal as them): an admin's real Supabase
// session is NEVER swapped. Instead, a short-lived, server-tracked row in
// company_os.portal_assume_sessions — referenced only by an opaque id in an
// httpOnly cookie — lets getPortalActor() build a scoped actor for that one
// company while the admin stays authenticated as themselves throughout. See
// lib/admin/portal-assume.ts (start) and the portal entity's (dashboard)/actions.ts
// (end). Every start/end is audit-logged.

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSessionClient } from "@/kernel/data/supabase/server";
import { companyOs } from "@/kernel/data/supabase";
import { isAdminEmail } from "@/kernel/identity/admin-auth";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { actorDisplayName } from "@/kernel/config/people-name";

export const ASSUME_COOKIE = "portal_assume";
export const ASSUME_SESSION_MINUTES = 30;

export type PortalMembership = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  role: string;
};

export type PortalImpersonation = {
  adminEmail: string;
  sessionId: string;
  expiresAt: string;
};

export type PortalActor = {
  authUserId: string;
  personId: string;
  displayName: string;
  email: string;
  // Scope, computed server-side from the JWT — never from client input.
  companyScope: string[]; // companies.id values this actor may read
  memberships: PortalMembership[];
  // Set iff an admin is viewing this actor's portal via Assume. Every /portal
  // page renders a banner when this is present (the portal entity's layout).
  impersonation: PortalImpersonation | null;
  // True when an admin set a temporary password on this account
  // (user_metadata.must_change_password). The /portal layout forces a redirect
  // to /portal/change-password until the user picks their own.
  mustChangePassword: boolean;
};

type GetActorResult =
  | { actor: PortalActor; redirectTo?: undefined }
  | { actor: null; redirectTo: "/admin" | "/team" | "/portal/login" };

type MembershipRow = {
  id: string;
  company_id: string | null;
  role: string;
  companies: { name: string | null } | { name: string | null }[] | null;
};

type AssumeSessionRow = {
  id: string;
  company_id: string;
  person_id: string;
  started_by: string;
  expires_at: string;
  ended_at: string | null;
};

// Reads the Assume cookie and, if it points at a still-active session started
// by THIS admin, builds a portal actor scoped to that session's company. The
// started_by check means one admin's cookie can never be replayed to assume
// under a different admin's identity, even if leaked within the org. Returns
// null (never throws) on any missing/expired/mismatched/foreign-key-broken
// state — the caller falls back to the normal "admin -> /admin" redirect.
async function getActiveAssumeActor(adminEmail: string, adminAuthUserId: string): Promise<PortalActor | null> {
  const sessionId = cookies().get(ASSUME_COOKIE)?.value;
  if (!sessionId) return null;

  const { data } = await companyOs
    .from("portal_assume_sessions")
    .select("id, company_id, person_id, started_by, expires_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  const session = data as AssumeSessionRow | null;
  if (!session || session.ended_at || session.started_by !== adminEmail) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const [{ data: company }, { data: person }, { data: member }] = await Promise.all([
    companyOs.from("companies").select("id, name").eq("id", session.company_id).maybeSingle(),
    companyOs.from("people").select("id, full_name, email").eq("id", session.person_id).maybeSingle(),
    companyOs
      .from("portal_members")
      .select("role")
      .eq("company_id", session.company_id)
      .eq("person_id", session.person_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!company || !person) return null;

  // Assume carries the assumed person's REAL portal role, looked up live, so an
  // admin verifying a contributor's view sees the contributor gates (no
  // invoices, no user management), not an admin's. Sessions for a person with
  // no portal_members row (the primary-CRM-contact fallback for companies with
  // no portal users yet) keep the historical admin view.
  const assumedRole = (member as { role: string } | null)?.role ?? "admin";

  return {
    authUserId: adminAuthUserId,
    personId: person.id,
    displayName: person.full_name || person.email,
    email: person.email,
    companyScope: [company.id],
    memberships: [{ id: session.id, companyId: company.id, companyName: company.name, role: assumedRole }],
    impersonation: { adminEmail, sessionId: session.id, expiresAt: session.expires_at },
    mustChangePassword: false,
  };
}

// Resolve the signed-in user to a portal actor. Returns a redirect target
// instead of an actor when the caller is not a portal user:
//   - not signed in                    -> /portal/login
//   - an admin, no active Assume session -> /admin  (admins have no /portal identity)
//   - an active team member            -> /team   (employees use /team, never /portal)
//   - no active portal_members row     -> /portal/login
// Wrapped in React cache() so the /portal layout and the page (which both call
// requirePortalMember) resolve the identity chain ONCE per request instead of
// running the whole thing twice. Mirrors getAdminUser().
export const getPortalActor = cache(async (): Promise<GetActorResult> => {
  const supabase = createSessionClient();
  // Revalidates the JWT against GoTrue here rather than trusting middleware to
  // have done it: the matcher does not cover /api, and both /api/portal routes
  // call this gate. Identity is matched on auth_user_id below. See getAdminUser()
  // for the full rationale.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return { actor: null, redirectTo: "/portal/login" };

  // The admin check and the person lookup are independent, so start them together
  // rather than serially; the admin branch simply drops the (rare) person read.
  const adminP = isAdminEmail(email);
  const personP = companyOs
    .from("people")
    .select("id, full_name, first_name, preferred_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (await adminP) {
    const assumed = await getActiveAssumeActor(email, user.id);
    if (assumed) return { actor: assumed };
    return { actor: null, redirectTo: "/admin" };
  }

  // Identity by auth_user_id, never by email.
  const { data: person } = await personP;
  if (!person) return { actor: null, redirectTo: "/portal/login" };

  // Employees belong in /team. Provisioning refuses to invite active team
  // members, so hitting this means the person became staff after the invite —
  // route them to their real surface rather than double-scoping them.
  // Employment check and membership read both depend only on person.id and are
  // independent of each other, so run them together.
  const [{ data: employment }, { data: memberRows }] = await Promise.all([
    companyOs
      .from("team_members")
      .select("id")
      .eq("person_id", person.id)
      .in("status", PORTAL_STATUSES)
      .limit(1),
    companyOs
      .from("portal_members")
      .select("id, company_id, role, companies:companies!company_id(name)")
      .eq("person_id", person.id)
      .eq("status", "active"),
  ]);
  if ((employment ?? []).length > 0) return { actor: null, redirectTo: "/team" };

  const rows = (memberRows ?? []) as MembershipRow[];
  if (rows.length === 0) return { actor: null, redirectTo: "/portal/login" };

  const memberships: PortalMembership[] = rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    companyName: one(r.companies)?.name ?? null,
    role: r.role,
  }));
  const companyScope = memberships
    .map((m) => m.companyId)
    .filter((id): id is string => !!id);

  return {
    actor: {
      authUserId: user.id,
      personId: person.id,
      displayName: actorDisplayName(person),
      email: person.email,
      companyScope,
      memberships,
      impersonation: null,
      mustChangePassword: user.user_metadata?.must_change_password === true,
    },
  };
});

// Gate for /portal pages and server actions. Redirects when the caller has no
// portal identity. Call at the top of the /portal layout and EVERY /portal action.
export async function requirePortalMember(): Promise<PortalActor> {
  const { actor, redirectTo } = await getPortalActor();
  if (!actor) redirect(redirectTo);
  return actor;
}
