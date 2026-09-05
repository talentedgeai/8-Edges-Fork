"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { decideAssignedTimeOff } from "@/entities/portal/lib/time-off";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Client-manager leave decisions. Every check that matters lives in
// decideAssignedTimeOff (entities/portal/lib/time-off.ts) — scope, ownership, pending
// state, and an independent approver check — so this file stays a thin gate
// plus best-effort notification.

export async function decideMyTeamTimeOff(id: string, decision: "approved" | "rejected") {
  const actor = await requirePortalMember();
  const res = await decideAssignedTimeOff(actor, id, decision);
  if (!res.ok) return res;

  revalidatePath("/portal/time-off");
  notifyMember(id, decision, actor.displayName).catch(() => {});
  return res;
}

// Tell the employee what happened. Best-effort: a mail failure must never
// undo or fail a decision that is already recorded.
async function notifyMember(id: string, decision: "approved" | "rejected", deciderName: string) {
  const { data } = await companyOs
    .from("time_off")
    .select("start_date, end_date, team_members!team_member_id(people!person_id(email, preferred_name, full_name))")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;

  const row = data as unknown as {
    start_date: string;
    end_date: string;
    team_members: { people: { email: string | null } | { email: string | null }[] } | null;
  };
  const peopleRef = row.team_members?.people;
  const personRecord = Array.isArray(peopleRef) ? peopleRef[0] : peopleRef;
  const email = personRecord?.email;
  const range = row.start_date === row.end_date ? row.start_date : `${row.start_date} → ${row.end_date}`;
  const verb = decision === "approved" ? "approved" : "declined";

  notifyOps(`Time off ${verb} by ${deciderName} (client manager): ${range}.`).catch(() => {});
  if (!email) return;

  await sendTransactionalEmail({
    to: email,
    subject: `Your time off request was ${verb}`,
    html: `
      <p>Your leave request for ${range} was <strong>${verb}</strong> by ${deciderName}.</p>
      <p><a href="${getSiteOrigin()}/team/time-off">See it in your Time Off page</a></p>
    `,
  });
}
