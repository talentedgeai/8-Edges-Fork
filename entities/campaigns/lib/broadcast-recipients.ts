import { getBroadcast } from "./broadcasts";
import { materializeRecipients } from "./recipients";

// The id-shaped door onto recipient building, for callers that hold a broadcast
// id rather than the row: the letter agent, which schedules its own letter once
// every check passes.
//
// It does not build anything itself. When this file was first written the whole
// build lived here, copied from the admin action so the agent could share it;
// saved audiences (`campaign.audienceId`) landed on main in the months this
// branch sat open, and a copy taken before them would have quietly ignored the
// audience and mailed the segment instead. So the build stays in one place —
// `lib/recipients.ts`, which the admin's Build recipients action also calls —
// and this is only the lookup and the draft guard in front of it.
//
// Re-runnable while the broadcast is a draft: the unique (campaign_id, person_id)
// constraint means re-building after editing the segment adds newcomers without
// duplicating anyone.
export async function materialiseRecipients(id: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status !== "draft") {
    return { ok: false, error: "Recipients can only be built while the broadcast is a draft." };
  }
  return materializeRecipients(campaign);
}
