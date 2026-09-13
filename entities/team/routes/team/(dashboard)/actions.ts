"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { companyOs } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";
import type { Json } from "@/kernel/data/supabase/database.types";

// Stamp the actor's own onboarding as done (or clear it, to replay the tour).
// Self-scoped: writes only the actor's own person row.
export async function setOnboardingDone(done: boolean): Promise<void> {
  const actor = await requireTeamMember();
  const { data, error: readError } = await companyOs
    .from("people")
    .select("metadata")
    .eq("id", actor.personId)
    .maybeSingle();
  if (readError) console.error("[team/actions] people", readError);
  const metadata = ((data as { metadata: Record<string, Json> | null } | null)?.metadata) ?? {};
  metadata.onboarding_completed_at = done ? new Date().toISOString() : null;
  const { error: writeError } = await updatePeople({ metadata, updated_at: new Date().toISOString() })
    .eq("id", actor.personId);
  if (writeError) console.error("[team/actions] people", writeError);
  revalidatePath("/team");
}
