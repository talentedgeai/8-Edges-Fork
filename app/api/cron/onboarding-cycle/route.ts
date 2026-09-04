import { NextResponse } from "next/server";
import { runOnboardingCycle, saigonToday } from "@/lib/onboarding-cycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): daily 07:30 UTC, right after probation-reviews.
// One pass over every live onboarding journey: backfill missing journeys, nag
// managers for missing plans (T-7..Day 1), send the Day 8 survey, trigger the
// probation review 15 days before probation ends, remind on missing decisions,
// promote passed hires to full time at probation end, and prompt the 180-day
// stay interview. Milestone sends are stamped on the journey (>= conditions),
// so a missed day self-heals on the next run; only the nag/reminder emails
// repeat daily by design. Auth is the standard Vercel Cron bearer.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runOnboardingCycle(saigonToday());
  return NextResponse.json(summary);
}
