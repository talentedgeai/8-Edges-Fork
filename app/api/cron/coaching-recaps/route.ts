import { NextResponse } from "next/server";
import { draftNextPendingRecap } from "@/lib/coaching/cycle";
import { saigonToday } from "@/lib/coaching/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel cron (see vercel.json): hourly. Drafts the recap for ONE held 1-1
// that has a transcript and no summary, whichever route put the transcript
// there — the daily cycle's Minutes pull, a paste into the coach page, or the
// lark-cli scheduled task on Dave's machine writing straight to company_os.
//
// Separate from /api/cron/coaching-cycle on purpose. Summarising is an Opus
// call over a long transcript, so the daily pass cannot absorb four of them
// inside its own 300s budget. One per hour drains an afternoon of 1-1s well
// before the next morning, and can never time out.
//
// The coach is emailed and DMed per draft. Publishing to the member stays a
// deliberate human act on the coach page — this route never publishes.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await draftNextPendingRecap(saigonToday());
  return NextResponse.json(result);
}
