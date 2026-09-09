import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { syncCertifications } from "@/entities/team/lib/certifications-sync";
import { notifyOps } from "@/kernel/messaging/lark";

// Vercel cron (see vercel.json): nightly mirror of each member's AI Officer
// Institute certification progress into people.metadata.certifications, which
// the /team home's "Get certified" card reads. Read-from-aiolabz, write-into-
// company_os; never deletes. A learner with no matching person is reported,
// not treated as a failure (contractors and alumni sign up too). Only a real
// fetch or DB error alarms ops.
async function handler(req: Request) {
  const result = await syncCertifications();
  if (!result.ok) {
    await notifyOps(
      `⚠️ AI Officer Institute certification sync failed: ${result.error}. Get certified on /team may be stale.`,
    );
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/certifications-sync/", req, handler);
