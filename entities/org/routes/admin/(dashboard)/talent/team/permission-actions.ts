"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { TEAM_PERMISSIONS } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { updateTeamMembers } from "@/kernel/identity/writes";
import type { SaveResult } from "./actions";

// Grant or revoke one team-portal permission (team_members.permissions). A list
// column, so it is not one of the scalar fields updateTeamMember routes: read,
// change the one value, write back. Unknown permission names are refused before
// any read.
export async function setTeamMemberPermission(
  teamMemberId: string,
  permission: string,
  granted: boolean,
): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!teamMemberId) return { ok: false, error: "Missing team member." };
  if (!(TEAM_PERMISSIONS as readonly string[]).includes(permission)) return { ok: false, error: "Unknown permission." };

  const { data: tm, error: readError } = await companyOs
    .from("team_members")
    .select("permissions")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (readError) {
    console.error("[talent] team_members permissions read failed:", readError.message);
    return { ok: false, error: "Could not save. Please try again." };
  }
  if (!tm) return { ok: false, error: "Team member not found." };

  const current = (tm.permissions ?? []) as string[];
  const next = granted ? [...new Set([...current, permission])] : current.filter((p) => p !== permission);
  const { error } = await updateTeamMembers({ permissions: next }).eq("id", teamMemberId);
  if (error) {
    console.error("[talent] team_members permissions update failed:", error.message);
    return { ok: false, error: "Could not save. Please try again." };
  }
  await recordAudit({
    table: "team_members",
    recordId: teamMemberId,
    operation: "update",
    actor: admin.email,
    context: { field: "permissions", permission, granted },
  });
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return { ok: true };
}
