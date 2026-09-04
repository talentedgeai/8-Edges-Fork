"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember, type TeamActor } from "@/lib/team-auth";
import { companyOs } from "@/lib/supabase";
import {
  advanceApplicationStage,
  rejectApplicationStage,
  stampBookingRequested,
  type Result,
} from "@/lib/ats/pipeline";

// A manager may only drive candidates on a req they own. Authorization is the
// application's req hiring_manager_id vs the actor's personId (an admin acting
// in /team may also drive). Never trusts anything from the client but the id.
async function actorManagesApplication(actor: TeamActor, applicationId: string): Promise<boolean> {
  const { data } = await companyOs
    .from("applications")
    .select("job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )")
    .eq("id", applicationId)
    .maybeSingle();
  const req = data
    ? (Array.isArray(data.job_requisitions) ? data.job_requisitions[0] : data.job_requisitions) as
        | { hiring_manager_id: string | null }
        | null
    : null;
  const hm = req?.hiring_manager_id ?? null;
  return actor.isAdmin || (hm != null && hm === actor.personId);
}

const DENIED: Result = { ok: false, error: "Only the hiring manager can do that." };

export async function advanceCandidate(applicationId: string): Promise<Result> {
  const actor = await requireTeamMember();
  if (!(await actorManagesApplication(actor, applicationId))) return DENIED;
  const r = await advanceApplicationStage(applicationId);
  if (!r.ok) return r;
  revalidatePath("/team/hiring");
  return { ok: true };
}

export async function rejectCandidate(applicationId: string): Promise<Result> {
  const actor = await requireTeamMember();
  if (!(await actorManagesApplication(actor, applicationId))) return DENIED;
  const r = await rejectApplicationStage(applicationId);
  if (!r.ok) return r;
  revalidatePath("/team/hiring");
  return { ok: true };
}

export async function requestBooking(applicationId: string): Promise<Result> {
  const actor = await requireTeamMember();
  if (!(await actorManagesApplication(actor, applicationId))) return DENIED;
  const r = await stampBookingRequested(applicationId);
  if (!r.ok) return r;
  revalidatePath("/team/hiring");
  return { ok: true };
}
