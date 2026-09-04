// Client-side user management (PR 3): a portal ADMIN manages their own
// company's users. Every function re-checks the caller holds the admin role
// for the target company (lib/portal/roles.ts) before touching anything, and
// all provisioning runs through the same engine the Edge8 admin UI uses
// (lib/admin/portal-invite.ts): auth user minted once, scanner-proof invite
// email via /portal/verify, revoke bans the auth user on last membership.
//
// Guards beyond the role gate:
//   - a client admin can only ever act inside their own company scope
//   - invites can never target Edge8 admins or active team members
//     (loadPortalTarget refuses both)
//   - you cannot revoke or re-role yourself (no self-lockout; Edge8 does that)

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { isPortalAdmin, ROLE_DENIED } from "@/lib/portal/roles";
import {
  invitePortalMemberCore,
  resendPortalLinkCore,
  revokePortalMemberCore,
} from "@/lib/admin/portal-invite";
import { getSignedInAuthUserIds, portalStatusOf, type PortalStatus } from "@/lib/admin/portal-status";
import { recordAudit } from "@/lib/admin/audit";
import { one } from "@/lib/embedded";

type Result = { ok: true; message: string } | { ok: false; error: string };

const ASSIGNABLE_ROLES = ["admin", "contributor", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(v: string): v is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(v);
}

export type CompanyUser = {
  personId: string;
  name: string;
  email: string;
  role: string;
  membershipStatus: string; // active | revoked
  accessStatus: PortalStatus; // none | invited | active (has signed in)
  isSelf: boolean;
};

type MemberRow = {
  person_id: string;
  role: string;
  status: string;
  people: {
    id: string;
    full_name: string | null;
    preferred_name: string | null;
    email: string;
    auth_user_id: string | null;
  } | Array<{
    id: string;
    full_name: string | null;
    preferred_name: string | null;
    email: string;
    auth_user_id: string | null;
  }> | null;
};

// The company's portal users, for the Users page. Admin-only.
export async function listCompanyUsers(
  actor: PortalActor,
  companyId: string,
): Promise<CompanyUser[] | null> {
  if (!isPortalAdmin(actor, companyId)) return null;
  const { data } = await companyOs
    .from("portal_members")
    .select("person_id, role, status, people:people!person_id(id, full_name, preferred_name, email, auth_user_id)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as MemberRow[];

  const authIds = rows
    .map((r) => one(r.people)?.auth_user_id)
    .filter((v): v is string => !!v);
  const signedIn = await getSignedInAuthUserIds(authIds);

  return rows.flatMap((r) => {
    const p = one(r.people);
    if (!p) return [];
    return [{
      personId: p.id,
      name: p.preferred_name || p.full_name || p.email,
      email: p.email,
      role: r.role,
      membershipStatus: r.status,
      accessStatus: portalStatusOf(p.auth_user_id, signedIn),
      isSelf: p.id === actor.personId,
    }];
  });
}

// Invite by name + email. Finds or creates the person, ensures the CRM link,
// then runs the shared invite engine with the chosen role.
export async function inviteCompanyUser(
  actor: PortalActor,
  input: { companyId: string; name: string; email: string; role: string },
): Promise<Result> {
  if (!isPortalAdmin(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (!isAssignableRole(input.role)) return { ok: false, error: "Pick a role." };
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim();
  if (!email || !email.includes("@")) return { ok: false, error: "A valid email is required." };
  if (!name) return { ok: false, error: "A name is required." };

  // Find (by email, unarchived) or create the person.
  const { data: existing } = await companyOs
    .from("people")
    .select("id, archived_at")
    .eq("email", email)
    .maybeSingle();
  let personId: string;
  if (existing && !existing.archived_at) {
    personId = existing.id as string;
  } else if (existing?.archived_at) {
    return { ok: false, error: "This email belongs to an archived contact. Ask Edge8 to restore it." };
  } else {
    const { data: created, error } = await companyOs
      .from("people")
      .insert({ email, full_name: name, source: "portal_user_invite" })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: "Could not create the contact." };
    personId = created.id as string;
  }

  // Ensure the CRM link the invite engine requires (portal members are always
  // known company contacts).
  const { data: link } = await companyOs
    .from("person_companies")
    .select("id")
    .eq("person_id", personId)
    .eq("company_id", input.companyId)
    .limit(1);
  if ((link ?? []).length === 0) {
    const { error } = await companyOs
      .from("person_companies")
      .insert({ person_id: personId, company_id: input.companyId, role: "employee" });
    if (error) return { ok: false, error: "Could not link the contact to your company." };
  }

  const via = actor.impersonation ? `${actor.impersonation.adminEmail} (assume: ${actor.email})` : actor.email;
  return invitePortalMemberCore(personId, input.companyId, via, "portal_ui", input.role);
}

export async function resendCompanyUserInvite(
  actor: PortalActor,
  input: { companyId: string; personId: string },
): Promise<Result> {
  if (!isPortalAdmin(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (!(await memberOfCompany(input.personId, input.companyId))) {
    return { ok: false, error: "Not a member of your company." };
  }
  return resendPortalLinkCore(input.personId, input.companyId, actor.email, "portal_ui");
}

export async function revokeCompanyUser(
  actor: PortalActor,
  input: { companyId: string; personId: string },
): Promise<Result> {
  if (!isPortalAdmin(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (input.personId === actor.personId) {
    return { ok: false, error: "You cannot revoke your own access. Ask Edge8." };
  }
  if (!(await memberOfCompany(input.personId, input.companyId))) {
    return { ok: false, error: "Not a member of your company." };
  }
  return revokePortalMemberCore(input.personId, input.companyId, actor.email, "portal_ui");
}

export async function setCompanyUserRole(
  actor: PortalActor,
  input: { companyId: string; personId: string; role: string },
): Promise<Result> {
  if (!isPortalAdmin(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (!isAssignableRole(input.role)) return { ok: false, error: "Unknown role." };
  if (input.personId === actor.personId) {
    return { ok: false, error: "You cannot change your own role. Ask Edge8." };
  }
  const { data, error } = await companyOs
    .from("portal_members")
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq("person_id", input.personId)
    .eq("company_id", input.companyId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update the role." };
  await recordAudit({
    table: "portal_members",
    recordId: data.id as string,
    operation: "update",
    actor: actor.email,
    context: { action: "portal_role_change", person_id: input.personId, company_id: input.companyId, role: input.role, via: "portal_ui" },
  });
  return { ok: true, message: `Role set to ${input.role}.` };
}

async function memberOfCompany(personId: string, companyId: string): Promise<boolean> {
  const { data } = await companyOs
    .from("portal_members")
    .select("id")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .limit(1);
  return (data ?? []).length > 0;
}
