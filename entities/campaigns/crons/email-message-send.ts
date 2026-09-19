import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { sendDueMessages } from "@/entities/campaigns/lib/personal/send";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "5,20,35,50 * * * *";

// Vercel cron (see vercel.json): every fifteen minutes, offset from the
// broadcast send tick so the two never race for the same person. Sends every
// approved personal message whose send moment has arrived, one at a time,
// through the same path a broadcast recipient takes: the live consent recheck,
// one marketing email per person per company day across both kinds, Resend,
// the CRM interaction, and the Resend id the events webhook matches on.

const ROUTINE_ID = "/api/cron/email-message-send/";

async function handler(): Promise<Response> {
  const s = await sendDueMessages({ limit: 25 });
  return NextResponse.json({
    ...s,
    message: `${s.claimed} claimed: ${s.sent} sent, ${s.deferred} deferred, ${s.skipped} skipped, ${s.failed} failed${s.writeFailures ? `, ${s.writeFailures} write failure(s)` : ""}.`,
  });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
