import { NextResponse } from "next/server";
import { periodMonth, rollupContractorPayments } from "@/lib/admin/contractor-payments";
import { pingOps } from "@/lib/contractor-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): 1st of the month, 06:00 UTC. Rolls the
// previous month's accepted contractor work into payment requests. Auth is
// the standard Vercel Cron bearer scheme — enforced whenever CRON_SECRET is
// set (it is, in production).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
