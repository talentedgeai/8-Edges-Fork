import { NextResponse } from "next/server";
import { runCoachingCycle } from "@/lib/coaching/cycle";
import { saigonToday } from "@/lib/coaching/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel cron (see vercel.json): daily 00:45 UTC = 07:45 Saigon, so preps and
// nudges land before the workday starts (Dave reads his prep by 09:00 +07).
// One pass over every active coaching profile: generate the prep for upcoming
// 1-1s (and mail the coach), nudge on lapsed cadences (weekly), send the
// mid-cycle check-in to the member (once per cycle), and run last month's
// trend reports in the first days of the month. Every step is stamped, so a
// missed day self-heals on the next run. Auth is the standard Vercel Cron
// bearer.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runCoachingCycle(saigonToday());
  return NextResponse.json(summary);
}
