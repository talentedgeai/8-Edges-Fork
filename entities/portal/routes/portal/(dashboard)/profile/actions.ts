"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { updatePersonalProfile, type PersonalProfile } from "@/entities/portal/lib/profile";

// Self-scoped: requirePortalMember() supplies the person id from the JWT, so
// the client sends values only, never an id.
export async function savePersonalProfile(
  input: PersonalProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requirePortalMember();
  const res = await updatePersonalProfile(actor, input);
  if (res.ok) {
    revalidatePath("/portal/profile");
    revalidatePath("/portal");
  }
  return res;
}
