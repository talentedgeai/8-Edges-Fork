import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { generateIdeaTrends } from "@/entities/company-os/lib/ai/idea-trends";

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// Vercel cron (see vercel.json): weekly, Monday 03:00 UTC. Regenerates the
// "trends across ideas" summary shown on the Innovation cockpit and stores it
// as a new company_os.idea_trend_reports row (the cockpit renders the newest).
async function handler(req: Request) {
  const trends = await generateIdeaTrends();
  if (!trends) {
    // No key, not enough material, or an API error — leave the last report in
    // place rather than overwriting it with nothing.
    return NextResponse.json({ generated: false });
  }

  const { error } = await companyOs.from("idea_trend_reports").insert({
    themes: trends.themes,
    source_count: trends.sourceCount,
    model: trends.model,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ generated: true, themes: trends.themes.length, sourceCount: trends.sourceCount });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/idea-trends/", req, handler);
