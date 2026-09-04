"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/lib/portal-auth";
import { chooseRedemptionForActor } from "@/lib/portal/referrals";

// Client-portal action: an affiliate chooses how to take one of their own
// commissions. requirePortalMember() gates identity; chooseRedemptionForActor
// re-checks ownership against the actor's codes before writing (no trust in the
// client-supplied id).
export async function chooseRedemption(
  commissionId: string,
  choice: "work_credit" | "cash",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requirePortalMember();
  const r = await chooseRedemptionForActor(actor, commissionId, choice);
  if (r.ok) revalidatePath("/portal/referrals");
  return r;
}
