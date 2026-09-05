"use server";

import { revalidatePath } from "next/cache";
import { signOutTo } from "@/kernel/identity/session";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { companyOs } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";
import type { Json } from "@/kernel/data/supabase/database.types";

// Sign the team member out and return them to the portal login.
export async function signOut() {
  await signOutTo("/team/login");
}

// Stamp the actor's own onboarding as done (or clear it, to replay the tour).
// Self-scoped: writes only the actor's own person row.
export async function setOnboardingDone(done: boolean): Promise<void> {
  const actor = await requireTeamMember();
  const { data } = await companyOs
    .from("people")
    .select("metadata")
    .eq("id", actor.personId)
    .maybeSingle();
  const metadata = ((data as { metadata: Record<string, Json> | null } | null)?.metadata) ?? {};
  metadata.onboarding_completed_at = done ? new Date().toISOString() : null;
  await updatePeople({ metadata, updated_at: new Date().toISOString() })
    .eq("id", actor.personId);
  revalidatePath("/team");
}
