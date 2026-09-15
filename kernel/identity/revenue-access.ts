// Server-only gate for the Revenue section, which is served on two surfaces:
// /admin/revenue for admins and /team/revenue for employees an admin has granted
// the `revenue` permission (team_members.permissions). Every revenue page and
// server action calls requireRevenueAccess() instead of requireAdmin(), so the
// same action works from either surface and nobody else can call it.
//
// It answers with the same { id, email } shape as requireAdmin(), because the
// actions pass `.email` to the audit log as the actor.

import { redirect } from "next/navigation";
import { perRender } from "./per-render";
import { getAdminUser, type AdminUser } from "./admin-auth";
import { getTeamActor } from "./team-auth";

export const getRevenueUser = perRender(async (): Promise<AdminUser | null> => {
  const admin = await getAdminUser();
  if (admin) return admin;
  // getTeamActor matches identity on auth_user_id and reads the grant from the
  // employment row, so the permission is never taken from the client.
  const { actor } = await getTeamActor();
  if (actor?.permissions.includes("revenue")) return { id: actor.authUserId, email: actor.email };
  return null;
});

// Gate for revenue pages and actions. A caller without access goes to the team
// home, where the team layout sends anyone without a team identity to log in.
export async function requireRevenueAccess(): Promise<AdminUser> {
  const user = await getRevenueUser();
  if (!user) redirect("/team");
  return user;
}
