"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/team-auth";
import { teamInsertOwn } from "@/lib/team/data";
import { EQUIPMENT_TYPES } from "@/lib/admin/equipment-shared";

// Own-service equipment request. teamInsertOwn forces person_id = actor's own
// id server-side, so a request can only ever be raised as yourself.

const MAX_REASON = 1000;

export type RequestResult = { ok: true } | { ok: false; error: string };

export async function requestEquipment(input: {
  type: string;
  reason: string;
  neededBy?: string;
}): Promise<RequestResult> {
  const actor = await requireTeamMember();

  if (!(EQUIPMENT_TYPES as readonly string[]).includes(input.type)) {
    return { ok: false, error: "Pick what you need." };
  }
  const reason = input.reason?.trim() ?? "";
  if (!reason) return { ok: false, error: "Tell us what it's for." };
  if (reason.length > MAX_REASON) return { ok: false, error: "Keep the reason under 1000 characters." };

  const { error } = await teamInsertOwn(actor, "equipment_requests", {
    type: input.type,
    reason,
    needed_by: input.neededBy?.trim() || null,
  });
  if (error) return { ok: false, error };

  revalidatePath("/team/equipment");
  revalidatePath("/admin/operations/equipment");
  return { ok: true };
}
