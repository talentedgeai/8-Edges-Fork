import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { runOnboardingCycle, saigonToday } from "@/entities/onboarding/lib/cycle";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 7 * * *";

// Vercel cron (see vercel.json): daily 07:30 UTC, right after probation-reviews.
// One pass over every live onboarding journey: backfill missing journeys, nag
// managers for missing plans (T-7..Day 1), send the Day 8 survey, trigger the
// probation review 15 days before probation ends, remind on missing decisions,
// promote passed hires to full time at probation end, and prompt the 180-day
// stay interview. Milestone sends are stamped on the journey (>= conditions),
// so a missed day self-heals on the next run; only the nag/reminder emails
// repeat daily by design. Auth is the standard Vercel Cron bearer.
async function handler(req: Request) {
  const summary = await runOnboardingCycle(saigonToday());
  return NextResponse.json(summary);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/onboarding-cycle/", req, handler);
