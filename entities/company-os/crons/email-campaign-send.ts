import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { parseBroadcastBlocks, sendMarketingEmail, utmCampaignFor } from "@/entities/site";
import { checkSendGate } from "@/entities/company-os/modules/campaigns/broadcasts";
import { resolveBroadcastBlocks } from "@/entities/company-os/modules/campaigns/broadcast-blocks";

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// A batch is sequential and each recipient costs a few round trips plus a
// Resend call, so 150 recipients needs minutes, not the default seconds. Without
// this the function is torn down mid-batch, between Resend accepting a message
// and the row being marked sent, and the next tick mails that person again.
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

async function handler(_req: Request) {
  // Oldest campaign that is actively sending AND whose schedule has arrived. The
  // schedule is part of the filter rather than an early return: otherwise a
  // campaign scheduled for next week would be picked as "oldest" every tick and
  // block every other campaign behind it.
  const nowIso = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await companyOs
    .from("email_campaigns")
    .select("id, subject, preheader, body_md, blocks, from_email, reply_to, batch_size, scheduled_at")
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
        blocks: unknown;
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
    const { count: inFlight, error: inFlightError } = await companyOs
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "claimed"]);

    // A failed count is not evidence that nothing is in flight; completing the
    // campaign on that basis would abandon a batch another invocation still holds.
    if (inFlightError) {
      console.error(`${LOG} in-flight count failed for ${campaign.id}: ${inFlightError.message}`);
      return NextResponse.json({ error: inFlightError.message }, { status: 500 });
    }

    if (inFlight && inFlight > 0) {
      return NextResponse.json({ campaign: campaign.id, in_flight: inFlight });
    }

    const { error: completeError } = await companyOs
      .from("email_campaigns")
      .update({ status: "sent", sent_at: nowIso, updated_at: nowIso })
      .eq("id", campaign.id)
      .eq("status", "sending");
    if (completeError) {
      console.error(`${LOG} marking campaign ${campaign.id} sent failed: ${completeError.message}`);
      return NextResponse.json(
        { campaign: campaign.id, completed: false, writeFailures: 1 },
        { status: 500 },
      );
    }
    return NextResponse.json({ campaign: campaign.id, completed: true, writeFailures: 0 });
  }

  // The featured posts and the call to action are the same for every recipient:
  // resolved once per tick, not once per send.
  const blocks = await resolveBroadcastBlocks(parseBroadcastBlocks(campaign.blocks));
  // One utm_campaign for the whole send, dated by the tick that started it.
  const utmCampaign = utmCampaignFor({ subject: campaign.subject, date: nowIso });

  // First names for the greeting, one read for the whole batch. A failed read
  // costs the personalisation ("Hi there"), never the send.
  const firstNames = new Map<string, string | null>();
  try {
    const { data: people } = await companyOs
      .from("people")
      .select("id, first_name, display_name")
      .in("id", rows.map((r) => r.person_id));
    for (const p of (people ?? []) as { id: string; first_name: string | null; display_name: string | null }[]) {
      firstNames.set(p.id, p.first_name ?? p.display_name?.split(" ")[0] ?? null);
    }
  } catch (err) {
    console.error(`${LOG} first-name lookup failed:`, err instanceof Error ? err.message : String(err));
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;
  // Bookkeeping writes that failed. Surfaced in the run summary so a tick that
  // sent mail but could not record it is not reported as a clean run.
  let writeFailures = 0;
  const sentEmailIds: string[] = [];

  for (const row of rows) {
    // Live consent, do-not-contact, persona, archived, and prior hard failures.
    const gate = await checkSendGate(row.person_id, row.email);

    if (gate.verdict === "error") {
      // A database hiccup is not a suppression. Put the row back so the next
      // tick retries it, rather than marking someone permanently skipped over a
      // transient timeout.
      const { error: deferError } = await companyOs
        .from("email_campaign_recipients")
        .update({ status: "pending", claimed_at: null })
        .eq("id", row.id);
      if (deferError) {
        writeFailures += 1;
        console.error(`${LOG} returning ${row.id} to pending failed: ${deferError.message}`);
      }
      deferred += 1;
      console.error(`${LOG} gate check failed for ${row.email}, deferred: ${gate.message}`);
      continue;
    }

    if (gate.verdict === "suppress") {
      const { error: skipError } = await companyOs
        .from("email_campaign_recipients")
        .update({ status: "skipped", skip_reason: gate.reason })
        .eq("id", row.id);
      if (skipError) {
        writeFailures += 1;
        console.error(`${LOG} marking ${row.id} skipped failed: ${skipError.message}`);
      }
      skipped += 1;
      continue;
    }

    const result = await sendMarketingEmail({
      to: row.email,
      personId: row.person_id,
      subject: campaign.subject,
      preheader: campaign.preheader,
      bodyMd: campaign.body_md,
      blocks,
      firstName: firstNames.get(row.person_id) ?? null,
      utmCampaign,
      from: campaign.from_email,
      replyTo: campaign.reply_to,
      campaignId: campaign.id,
      logSource: "marketing_campaign",
    });

    if (result.ok) {
      const { error: sentError } = await companyOs
        .from("email_campaign_recipients")
        .update({
          status: "sent",
          resend_email_id: result.resendEmailId,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);
      // The mail is gone; only the record of it failed. Count and log it so the
      // run is not reported clean, and leave the claim/retry semantics alone.
      if (sentError) {
        writeFailures += 1;
        console.error(`${LOG} marking ${row.id} sent failed: ${sentError.message}`);
      }
      sent += 1;
      if (result.resendEmailId) sentEmailIds.push(result.resendEmailId);
    } else {
      // Left as failed rather than retried: a retry loop against a permanently
      // bad address burns reputation. Failures are visible on the campaign page.
      const { error: failError } = await companyOs
        .from("email_campaign_recipients")
        .update({ status: "failed", error: result.error })
        .eq("id", row.id);
      if (failError) {
        writeFailures += 1;
        console.error(`${LOG} recording send failure for ${row.id} failed: ${failError.message}`);
      }
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
    writeFailures,
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

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/email-campaign-send/", req, handler);
