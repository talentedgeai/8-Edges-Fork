import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { getBroadcast } from "../broadcasts";
import { materialiseRecipients } from "../broadcast-recipients";
import { TUESDAY_FRIDAY_EIGHT } from "../send-window";
import { stampSendWindow } from "../send-window-stamp";
import { LETTER_ACTOR } from "./types";

// The letter needs no person's approval. Once every check has passed, the
// agent builds the list, approves, stamps each recipient with the next Tuesday
// or Friday 08:00 in their own zone (GMT+7 when unknown) and hands the letter
// to the send cron. The Marketing chat gets a review message; cancelling the
// broadcast before its first send time stops it.

export type ScheduledLetter = { ok: true; recipients: number; firstSendAt: string | null } | { ok: false; error: string };

export async function scheduleLetter(id: string): Promise<ScheduledLetter> {
  const letter = await getBroadcast(id);
  if (!letter) return { ok: false, error: "Broadcast not found." };
  if (letter.status !== "draft") return { ok: false, error: `The broadcast is ${letter.status}, not a draft.` };

  const built = await materialiseRecipients(id);
  if (!built.ok) return built;

  const now = new Date().toISOString();
  const { error: approveError } = await companyOs.from("email_campaigns").update({
      status: "approved",
      approved_at: now,
      approved_by: LETTER_ACTOR,
      segment: { ...letter.segment, sendWindow: TUESDAY_FRIDAY_EIGHT },
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "draft");
  if (approveError) return { ok: false, error: approveError.message };

  const stamped = await stampSendWindow(id, TUESDAY_FRIDAY_EIGHT);
  if (!stamped.ok) return { ok: false, error: `Approved, but the send times could not be stamped: ${stamped.error}` };

  const { data: first, error: firstError } = await companyOs.from("email_campaign_recipients").select("send_after")
    .eq("campaign_id", id)
    .eq("status", "pending")
    .order("send_after", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstError) return { ok: false, error: firstError.message };
  const firstSendAt = first?.send_after ?? null;

  // scheduled_at is the first recipient's moment: the send cron takes the
  // oldest due broadcast, so a letter waiting for its window must not hold that
  // slot against a broadcast that is due now.
  const { error: sendError } = await companyOs.from("email_campaigns").update({ status: "sending", scheduled_at: firstSendAt, updated_at: now })
    .eq("id", id)
    .eq("status", "approved");
  if (sendError) return { ok: false, error: sendError.message };

  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: LETTER_ACTOR,
    context: { approved: true, sending: true, recipients: stamped.summary.stamped, firstSendAt, zoneSources: stamped.summary.sources },
  });
  return { ok: true, recipients: stamped.summary.stamped, firstSendAt };
}
