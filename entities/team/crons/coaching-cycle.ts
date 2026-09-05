import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { runCoachingCycle } from "@/entities/team/modules/coaching/cycle";
import { saigonToday } from "@/entities/team/modules/coaching";

// Vercel cron (see vercel.json): daily 00:45 UTC = 07:45 Saigon, so preps and
// nudges land before the workday starts (Dave reads his prep by 09:00 +07).
// One pass over every active coaching profile: generate the prep for upcoming
// 1-1s (and mail the coach), nudge on lapsed cadences (weekly), send the
// mid-cycle check-in to the member (once per cycle), and run last month's
// trend reports in the first days of the month. Every step is stamped, so a
// missed day self-heals on the next run. Auth is the standard Vercel Cron
// bearer.
async function handler(req: Request) {
  const summary = await runCoachingCycle(saigonToday());
  return NextResponse.json(summary);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-cycle/", req, handler);
