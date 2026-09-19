import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { ingestZoomCoachingSessions } from "@/entities/coaching/lib/zoom-ingest";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "40 * * * *";

// Vercel cron (see vercel.json): hourly, at :40. Pulls new Zoom cloud-recording
// transcripts of the group coaching sessions (the weekly cohort call) into
// company_os.meetings, writes our own actionable summary and action items, and
// posts a card to the coaching Lark group with a link to
// /team/coaching-sessions. Hourly rather than one weekly slot because
// Zoom finishes a transcript anywhere from minutes to an hour after the
// recording ends, and a fixed slot would miss the late ones; an hour with
// nothing new costs one Zoom list call. Dedup on the recording UUID makes every
// run idempotent, so a session is never ingested or announced twice.
//
// Before this route the same work was scripts/crm/zoom-ingest.mjs, run by hand
// from an operator's laptop after each session. Off entirely (a clean run with
// enabled: false) until ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and
// ZOOM_HOST_EMAIL are set on the deployment.
async function handler(req: Request) {
  const result = await ingestZoomCoachingSessions(saigonToday(), getSiteOrigin());
  return NextResponse.json(result);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/zoom-transcripts/", req, handler);
