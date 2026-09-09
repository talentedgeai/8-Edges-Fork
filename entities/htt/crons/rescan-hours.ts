import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { rescanAllHours, rescanPersonHours } from "@/entities/htt/hours-ledger";

/**
 * Re-run the hours rule over stored sessions, on demand.
 *
 * A ledger row keeps whatever weights were in force when it was written, and
 * the only thing that rewrites one is the live ingest posting a session for that
 * same day. So after a rule change — the unattended taper and the daily cap of
 * 2026-09-07 — history stays wrong until something walks it. The ledger has a
 * "Re-scan hours" button for that, but it needs a staff browser session, which
 * a preview deploy cannot mint (no NEXT_PUBLIC_SUPABASE_* there) and a shell
 * cannot fake. This route is the same rescan behind the cron bearer instead, so
 * one curl with CRON_SECRET applies a rule change anywhere the code is deployed.
 *
 * Not scheduled in vercel.json: a nightly rescan would rewrite every day every
 * night for no reason. It exists to be triggered.
 *
 *   ?person=<people.id>   rescan one person; omit for everyone
 *   ?since=YYYY-MM-DD     only days on or after this date
 */
async function handler(req: Request) {
  const url = new URL(req.url);
  const person = url.searchParams.get("person");
  const since = url.searchParams.get("since") ?? undefined;
  if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ ok: false, error: "since must be YYYY-MM-DD" }, { status: 400 });
  }
  const written = person ? await rescanPersonHours(person, since) : await rescanAllHours(since);
  return NextResponse.json({ ok: true, written, person: person ?? "all", since: since ?? null });
}

// Manual trigger only, but recorded like a run so Settings -> Agents shows it.
export const GET = (req: Request) => withRoutineRun("/api/cron/htt-rescan-hours/", req, handler);
