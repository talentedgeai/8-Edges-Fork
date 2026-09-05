"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { assertInScope, teamUpdateInScope } from "@/entities/team/lib/data";
import { savePlanLink, uploadPlanDocument, setJourneyStage } from "@/entities/team/modules/onboarding/cycle";

// Onboarding-board actions for /team managers. Same discipline as the time-off
// actions: requireTeamMember() plus the scoped helpers in lib/team/data.ts —
// assertInScope re-derives ownership server-side, so a client-forged journey or
// task id for someone outside the manager's reports is a no-op.

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/team/onboarding");
}

// The plan is the manager's deliverable, so these three are manager-gated even
// though an employee's own journey is technically in their scope.
async function requireManagerScope(journeyId: string) {
  const actor = await requireTeamMember();
  if (actor.role !== "manager") return { actor: null, ownerTeamMemberId: null };
  if (!journeyId) return { actor, ownerTeamMemberId: null };
  const ownerTeamMemberId = await assertInScope(actor, "onboarding_plans", journeyId);
  return { actor, ownerTeamMemberId };
}

// Add (or replace) the link to a report's onboarding plan.
export async function setOnboardingPlanLink(journeyId: string, url: string): Promise<Result> {
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const res = await savePlanLink(journeyId, url, actor.teamMemberId);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Upload (or replace) the plan document itself — markdown preferred, it
// renders readable at /team/onboarding/plan/[id].
export async function uploadOnboardingPlan(journeyId: string, formData: FormData): Promise<Result> {
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };

  const res = await uploadPlanDocument(journeyId, ownerTeamMemberId, actor.teamMemberId, file);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Move a report's journey to another stage (board drag or drawer select).
export async function moveOnboardingStage(journeyId: string, stage: string): Promise<Result> {
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const res = await setJourneyStage(journeyId, stage);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Tick / untick one of the Day 1 orientation activities.
export async function toggleDay1Task(taskId: string, done: boolean): Promise<Result> {
  const actor = await requireTeamMember();
  if (!taskId) return { ok: false, error: "Missing task." };

  const { ok, error } = await teamUpdateInScope(actor, "onboarding_tasks", taskId, {
    status: done ? "done" : "todo",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (!ok) return { ok: false, error: error ?? "Could not update the task." };

  refresh();
  return { ok: true };
}
