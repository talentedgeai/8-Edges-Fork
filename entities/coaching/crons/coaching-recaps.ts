import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { draftNextPendingRecap } from "@/entities/coaching/lib/cycle";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "25 * * * *";

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
async function handler(req: Request) {
  const result = await draftNextPendingRecap(saigonToday());
  return NextResponse.json(result);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-recaps/", req, handler);
