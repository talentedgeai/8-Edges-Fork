import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { checkSendGate } from "@/lib/admin/broadcasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
export const fetchCache = "force-no-store";
// A batch is sequential and each recipient costs a few round trips plus a
// Resend call, so 150 recipients needs minutes, not the default seconds. Without
// this the function is torn down mid-batch, between Resend accepting a message
// and the row being marked sent, and the next tick mails that person again.
export const maxDuration = 300;

// Vercel cron (see vercel.json): every 15 minutes.
//
// Works one campaign at a time, one batch per tick. That pacing is the point:
// the sending domain has never sent bulk mail, so reputation has to build
// gradually, and a bad list shows up as bounces on the first batch instead of
// after all 250 have gone out.
//
// Every recipient is re-checked against the live CRM immediately before its send.
// The list may have been built days earlier and somebody can unsubscribe in the
// meantime; a stale list must not be able to leak.

const LOG = "[cron/email-campaign-send]";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Oldest campaign that is actively sending AND whose schedule has arrived. The
  // schedule is part of the filter rather than an early return: otherwise a
  // campaign scheduled for next week would be picked as "oldest" every tick and
  // block every other campaign behind it.
  const nowIso = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await companyOs
    .from("email_campaigns")
    .select("id, subject, preheader, body_md, from_email, reply_to, batch_size, scheduled_at")
    .eq("status", "sending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const campaign = (campaigns ?? [])[0] as
    | {
        id: string;
        subject: string;
        preheader: string | null;
        body_md: string;
        from_email: string | null;
        reply_to: string | null;
        batch_size: number;
        scheduled_at: string | null;
      }
    | undefined;

  if (!campaign) {
    return NextResponse.json({ sending: 0, message: "No campaign is due." });
  }

  // Atomic claim. The rows move to 'claimed' in the same statement that selects
  // them, so an overlapping tick finds nothing to take and cannot double-send.
  // The function also returns rows whose claim went stale (an invocation that
  // died) back to pending first, so a crash costs one retry, not a stuck queue.
  const { data: batch, error: batchError } = await companyOs.rpc("claim_campaign_batch", {
    p_campaign_id: campaign.id,
    p_limit: campaign.batch_size,
  });

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as { id: string; person_id: string; email: string }[];

  // Nothing left to claim. Only finish the campaign once no row is still in
  // flight, or a batch claimed by a slower invocation would be abandoned.
  if (rows.length === 0) {
    const { count: inFlight } = await companyOs
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "claimed"]);

    if (inFlight && inFlight > 0) {
      return NextResponse.json({ campaign: campaign.id, in_flight: inFlight });
    }

    await companyOs
      .from("email_campaigns")
      .update({ status: "sent", sent_at: nowIso, updated_at: nowIso })
      .eq("id", campaign.id)
      .eq("status", "sending");
    return NextResponse.json({ campaign: campaign.id, completed: true });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;
  const sentEmailIds: string[] = [];

  for (const row of rows) {
    // Live consent, do-not-contact, persona, archived, and prior hard failures.
    const gate = await checkSendGate(row.person_id, row.email);

    if (gate.verdict === "error") {
      // A database hiccup is not a suppression. Put the row back so the next
      // tick retries it, rather than marking someone permanently skipped over a
      // transient timeout.
      await companyOs
        .from("email_campaign_recipients")
        .update({ status: "pending", claimed_at: null })
        .eq("id", row.id);
      deferred += 1;
      console.error(`${LOG} gate check failed for ${row.email}, deferred: ${gate.message}`);
      continue;
    }

    if (gate.verdict === "suppress") {
      await companyOs
        .from("email_campaign_recipients")
        .update({ status: "skipped", skip_reason: gate.reason })
        .eq("id", row.id);
      skipped += 1;
      continue;
    }

    const result = await sendMarketingEmail({
      to: row.email,
      personId: row.person_id,
      subject: campaign.subject,
      preheader: campaign.preheader,
      bodyMd: campaign.body_md,
      from: campaign.from_email,
      replyTo: campaign.reply_to,
      campaignId: campaign.id,
      logSource: "marketing_campaign",
    });

    if (result.ok) {
      await companyOs
        .from("email_campaign_recipients")
        .update({
          status: "sent",
          resend_email_id: result.resendEmailId,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);
      sent += 1;
      if (result.resendEmailId) sentEmailIds.push(result.resendEmailId);
    } else {
      // Left as failed rather than retried: a retry loop against a permanently
      // bad address burns reputation. Failures are visible on the campaign page.
      await companyOs
        .from("email_campaign_recipients")
        .update({ status: "failed", error: result.error })
        .eq("id", row.id);
      failed += 1;
      console.error(`${LOG} send failed for ${row.email}: ${result.error}`);
    }
  }

  // Attribute any events that arrived before the sender stamped the Resend id on
  // the recipient row (the 'sent' webhook can beat that UPDATE by milliseconds).
  await linkEvents(campaign.id, sentEmailIds);

  return NextResponse.json({
    campaign: campaign.id,
    batch: rows.length,
    sent,
    skipped,
    failed,
    deferred,
  });
}

// email_events rows arrive from the webhook with campaign_id null when the event
// beat the sender's own UPDATE. Only the ids from THIS batch are linked, in
// chunks: the previous version re-scanned every recipient ever sent and passed
// them all to .in(), which supabase-js serialises into the query string. A few
// hundred ids there exceeds the gateway's header limit and the whole update
// fails, leaving the results card permanently reading zero.
const LINK_CHUNK = 50;

async function linkEvents(campaignId: string, resendEmailIds: string[]): Promise<void> {
  for (let i = 0; i < resendEmailIds.length; i += LINK_CHUNK) {
    const chunk = resendEmailIds.slice(i, i + LINK_CHUNK);
    const { error } = await companyOs
      .from("email_events")
      .update({ campaign_id: campaignId })
      .in("resend_email_id", chunk)
      .is("campaign_id", null);

    if (error) console.error(`${LOG} linking events failed: ${error.message}`);
  }
}
