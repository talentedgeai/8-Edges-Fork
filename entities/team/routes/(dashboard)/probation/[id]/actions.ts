"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  applyProbationDecision,
  DECISION_BY_CHOICE,
  TALENT_DIRECTOR_EMAIL,
} from "@/entities/team/modules/onboarding/cycle";

// Record a probation decision from the auth-gated /team/probation page. This
// replaces the old public probation-45 survey: authorization happens here (the
// actor must be the subject's manager, an admin, or the talent director), so
// applyProbationDecision just applies it. The choice string must be one of
// DECISION_BY_CHOICE's keys.
export type DecisionResult = { ok: true; message: string } | { ok: false; error: string };

// Whether `actor` may decide `subjectTeamMemberId`'s probation. Shared by the
// page (to render) and this action (to authorize the write).
export async function canDecideProbation(
  actor: { teamMemberId: string; personId: string; isAdmin: boolean },
  subjectManagerId: string | null,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (subjectManagerId && subjectManagerId === actor.teamMemberId) return true;
  // Talent director (by email on the actor's person row).
  const { data } = await companyOs
    .from("people")
    .select("email")
    .eq("id", actor.personId)
    .maybeSingle();
  return (data?.email ?? "").toLowerCase() === TALENT_DIRECTOR_EMAIL;
}

export async function recordProbationDecisionAction(
  subjectTeamMemberId: string,
  choice: string,
): Promise<DecisionResult> {
  const actor = await requireTeamMember();
  const decision = DECISION_BY_CHOICE[choice];
  if (!decision) return { ok: false, error: "Unknown decision." };

  const { data: subject } = await companyOs
    .from("team_members")
    .select("id, manager_id, employment_stage")
    .eq("id", subjectTeamMemberId)
    .maybeSingle();
  if (!subject) return { ok: false, error: "Team member not found." };
  if (!(await canDecideProbation(actor, subject.manager_id as string | null)))
    return { ok: false, error: "You are not authorized to decide this probation." };

  const actorEmail =
    (
      await companyOs.from("people").select("email").eq("id", actor.personId).maybeSingle()
    ).data?.email ?? "";

  const res = await applyProbationDecision({
    subjectTeamMemberId,
    decision,
    decidedByTmId: actor.teamMemberId,
    actorEmail,
  });
  if (!res.ok) return res;

  revalidatePath(`/team/probation/${subjectTeamMemberId}`);
  const label =
    decision === "offer_full_time"
      ? "Offered full time. They are promoted when probation ends."
      : decision === "extend_probation_30"
        ? "Probation extended 30 days. Dates moved automatically."
        : "Termination recorded. The talent director has been notified to run offboarding.";
  return { ok: true, message: label };
}
