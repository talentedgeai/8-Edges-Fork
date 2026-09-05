"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import {
  addScopeForActor,
  cancelWorkRequestForActor,
  createPortalInquiryForActor,
  createWorkRequestForActor,
  decideEstimateForActor,
  decideWorkForActor,
} from "@/entities/portal/lib/client-work-requests";
import { createTeamRequestForActor, type TeamCandidateInput } from "@/entities/portal/lib/hire-requests";

// Client-portal actions for work requests. requirePortalMember() gates
// identity; every *ForActor helper re-checks company ownership before writing
// (no trust in client-supplied ids). Status guards live in the shared state
// machine (entities/portal/lib/work-requests.ts), so a stale form gets a friendly error, not
// an illegal transition.

type Result = { ok: true } | { ok: false; error: string };

function refresh(id?: string) {
  revalidatePath("/portal/requests");
  if (id) revalidatePath(`/portal/requests/${id}`);
}

export async function submitGeneralInquiry(input: { subject: string; message: string }): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await createPortalInquiryForActor(actor, input);
  if (r.ok) refresh();
  return r;
}

export async function createProjectRequest(input: {
  companyId: string;
  contractorPersonId: string;
  title: string;
  brief: string;
}): Promise<Result & { id?: string }> {
  const actor = await requirePortalMember();
  const r = await createWorkRequestForActor(actor, input);
  if (r.ok) refresh(r.id);
  return r;
}

export async function submitTeamRequest(input: {
  companyId: string;
  candidates: TeamCandidateInput[];
}): Promise<Result & { id?: string }> {
  const actor = await requirePortalMember();
  const r = await createTeamRequestForActor(actor, input);
  if (r.ok) refresh();
  return r;
}

export async function decideEstimate(
  id: string,
  decision: "approved" | "rejected" | "changes_requested",
  note: string,
): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await decideEstimateForActor(actor, id, decision, note);
  if (r.ok) refresh(id);
  return r;
}

export async function decideWork(id: string, decision: "accepted" | "revision", note: string): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await decideWorkForActor(actor, id, decision, note);
  if (r.ok) refresh(id);
  return r;
}

export async function cancelRequest(id: string, note: string): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await cancelWorkRequestForActor(actor, id, note);
  if (r.ok) refresh(id);
  return r;
}

export async function addScope(id: string, scope: string): Promise<Result> {
  const actor = await requirePortalMember();
  const r = await addScopeForActor(actor, id, scope);
  if (r.ok) refresh(id);
  return r;
}
