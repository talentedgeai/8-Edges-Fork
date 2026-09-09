import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { pingOps } from "@/entities/portal";
import { periodMonth, rollupContractorPayments } from "@/entities/company-os/lib/contractor-payments";

// Vercel cron (see vercel.json): 1st of the month, 06:00 UTC. Rolls the
// previous month's accepted contractor work into payment requests. It is a
// company-os cron (Q2): the roll-up writes contractor_payments, a company-os
// table, and the cron is the only door-graph consumer the roll-up had, so
// with the cron beside it the roll-up stays out of company-os's door graph
// and its portal writers no longer make company-os reach a higher layer. Auth is
// the standard Vercel Cron bearer scheme — enforced whenever CRON_SECRET is
// set (it is, in production).
async function handler(req: Request) {
  const period = periodMonth(-1);
  const result = await rollupContractorPayments(period);
  if ("error" in result) {
    console.error("[contractor-payments cron] failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (result.created + result.updated > 0 || result.skipped.length > 0) {
    await pingOps(
      `💸 Contractor payment roll-up for ${period}: ${result.created} created, ${result.updated} updated, ${result.requestsLinked} work items.` +
        (result.skipped.length ? `\nSkipped: ${result.skipped.join("; ")}` : "") +
        `\nReview: https://www.edge8.ai/admin/operations/contractor-payments`,
    );
  }

  return NextResponse.json(result);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/contractor-payments/", req, handler);
