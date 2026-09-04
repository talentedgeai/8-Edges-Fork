"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { requireTeamMember } from "@/lib/team-auth";
import { companyOs } from "@/lib/supabase";

// Sign the team member out and return them to the portal login.
export async function signOut() {
  const supabase = createSessionClient();
  await supabase.auth.signOut();
  redirect("/team/login");
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
  const metadata = ((data as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? {};
  metadata.onboarding_completed_at = done ? new Date().toISOString() : null;
  await companyOs
    .from("people")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", actor.personId);
  revalidatePath("/team");
}
