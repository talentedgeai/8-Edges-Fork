"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/lib/portal-auth";
import {
  inviteCompanyUser,
  resendCompanyUserInvite,
  revokeCompanyUser,
  setCompanyUserRole,
} from "@/lib/portal/users";

// Portal Users page actions (PR 3). requirePortalMember() gates identity; every
// helper re-checks the admin role for the target company plus the self-lockout
// and cross-company guards (lib/portal/users.ts).

type Result = { ok: true; message: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/portal/users");
}

export async function inviteUserAction(input: {
  companyId: string;
  name: string;
  email: string;
  role: string;
}): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await inviteCompanyUser(actor, input);
  if (r.ok) refresh();
  return r;
}

export async function resendUserInviteAction(input: {
  companyId: string;
  personId: string;
}): Promise<Result> {
  const actor = await requirePortalMember();
  return resendCompanyUserInvite(actor, input);
}

export async function revokeUserAction(input: {
  companyId: string;
  personId: string;
}): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await revokeCompanyUser(actor, input);
  if (r.ok) refresh();
  return r;
}

export async function setUserRoleAction(input: {
  companyId: string;
  personId: string;
  role: string;
}): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await setCompanyUserRole(actor, input);
  if (r.ok) refresh();
  return r;
}
