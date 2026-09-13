"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { recordRoutineRun } from "@/kernel/audit/routine-runs";
import { DAILY_CHECK_IN_ROUTINE, checkInResponse, runDailyCheckIn, type CheckInRunResult } from "./check-in-run";

// Run now, from Settings -> Agents. The cron owns the schedule; this is the
// same run started by hand when a day needs one — a missed morning, or a
// check after the webhooks change. It records against the same routine id, so
// the run history stays one list, and it is super-admin only because it posts
// to both team chats.
type Result = { ok: true; message: string } | { ok: false; error: string };

function describe(result: CheckInRunResult): string {
  if ("error" in result && result.error) return result.error;
  if ("skipped" in result) return `Nothing sent: ${result.skipped}.`;
  // `cards` and not `posted`: a failed run carries `posted` too, to say which
  // roster did get its check-in before the other was refused.
  if ("cards" in result) return `Posted to ${result.posted.join(" and ")} from ${result.cards} cards.`;
  return "Run finished.";
}

export async function runDailyCheckInNow(): Promise<Result> {
  const admin = await requireSuperAdmin();
  const holder: { result: CheckInRunResult } = { result: { error: "not run" } };
  await recordRoutineRun(DAILY_CHECK_IN_ROUTINE, async () => {
    holder.result = await runDailyCheckIn();
    // Through checkInResponse, so Run now and the cron agree on what a failed
    // run looks like. They disagreed until 2026-09-11: this one returned a
    // flat 200 and every undelivered morning was filed as ok.
    return checkInResponse(holder.result);
  });
  const result = holder.result;
  await recordAudit({
    table: "routine_runs",
    recordId: DAILY_CHECK_IN_ROUTINE,
    operation: "insert",
    actor: admin.email,
    context: { trigger: "run-now" },
  });
  revalidatePath(`/admin/settings/agents/${encodeURIComponent(DAILY_CHECK_IN_ROUTINE)}`);
  revalidatePath("/admin/settings/agents");
  if ("error" in result && result.error) return { ok: false, error: result.error };
  return { ok: true, message: describe(result) };
}
