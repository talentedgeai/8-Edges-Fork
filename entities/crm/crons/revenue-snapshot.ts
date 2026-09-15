import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { takeRevenueSnapshot } from "@/entities/crm/lib/revenue-metrics/snapshot";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 0 * * *";

// Nightly: one row in revenue_snapshots with the figures the Revenue hub
// showed at 00:30 UTC. The Pipeline tab charts the rows; history starts at the
// first one and the chart says so. A failed read refuses to write, because a
// half-loaded reading would be a wrong data point forever.
//
// On the first of the month the same run posts the month-end digest to the
// Revenue Lark channel (RF-9), reporting the month that just ended. The result
// says whether it went out and why not, so a silent non-delivery is visible in
// Settings -> Agents rather than being assumed.
async function handler() {
  const r = await takeRevenueSnapshot();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({
    takenOn: r.takenOn,
    openDeals: r.openDeals,
    openUsdCents: r.openUsdCents,
    digestPosted: r.digest.posted,
    digestSkipped: r.digest.posted ? undefined : r.digest.reason,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/revenue-snapshot/", req, handler);
