import { NextResponse } from "next/server";
import { runReviewScheduler } from "@/lib/review-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): daily 08:00 UTC. Opens review cycles whose
// moment date has just arrived (probation start+6w, mid-year anchor+5m,
// renewal anchor+11m) and chases open cycles weekly until each side submits.
// Auth is the standard Vercel Cron bearer.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry=1 previews the day's volume without opening cycles or sending mail.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const result = await runReviewScheduler(todayISO, { dryRun });
  return NextResponse.json({
    dryRun,
    date: result.date,
    opened: result.opened.length,
    openedDetail: result.opened,
    remindersSent: result.remindersSent,
    skippedNoManager: result.skippedNoManager.length,
  });
}
