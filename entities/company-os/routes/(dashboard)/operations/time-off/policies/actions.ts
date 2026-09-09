"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { updateLeavePolicies } from "@/entities/team";

type Result = { ok: true } | { ok: false; error: string };

// Flip a leave policy between auto-approved and manual. This is the only write
// on the policies page; entitlement rules stay synced from Day Off and are not
// editable here.
export async function setPolicyAutoApprove(id: string, autoApprove: boolean): Promise<Result> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing policy." };

  const { error } = await updateLeavePolicies({ auto_approve: autoApprove })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations/time-off/policies");
  revalidatePath("/admin/operations/time-off/requests");
  return { ok: true };
}
