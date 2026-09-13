import { NextResponse } from "next/server";
import { withRoutineRun, listRoutineRuns } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { notifyOps } from "@/kernel/messaging/lark";
import { startWriterRun } from "@/entities/campaigns/lib/writer/advance";
import { kickWriterStep, runWriterStep, WRITER_ROUTINE_ID } from "@/entities/campaigns/lib/writer/run-step";
import { isStale, startsWithinWindow } from "@/entities/campaigns/lib/writer/schedule";
import { isWriterStep } from "@/entities/campaigns/lib/writer/steps";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 * * * *";

// Vercel cron: hourly. Two jobs, both so a campaign can go from idea to live
// post with nobody pressing a button after the idea is written.
//
// 1. Start: a campaign whose start date is tomorrow (or today, if yesterday
//    was missed) and that has a brand, a written idea and no run yet gets its
//    writer started here, the first step run in this request, the rest handing
//    on as they always do. The post lands scheduled for its date, and the
//    daily publish routine puts it live (see step-publish). A campaign whose
//    blog is already scheduled or published is left alone: someone ran it.
// 2. Re-arm: a run parked on a step with no error and no step recorded for
//    ten minutes has lost its hand-off (it happens about one step in six).
//    The route is called again for it, which is what Continue on the hub does.
//
// Quiet when nothing is due; one ops message when it started or re-armed
// anything, naming the campaigns.

const ROUTINE_ID = "/api/cron/writer-schedule/";

type CampaignRow = {
  id: string;
  name: string;
  brand_id: string | null;
  idea: string | null;
  starts_on: string | null;
  writer_step: string | null;
  writer_error: string | null;
  writer_started_at: string | null;
};

async function handler(): Promise<Response> {
  const { data, error } = await companyOs
    .from("marketing_campaigns")
    .select("id, name, brand_id, idea, starts_on, writer_step, writer_error, writer_started_at")
    .eq("status", "active");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const campaigns = (data ?? []) as CampaignRow[];

  const today = new Date().toISOString().slice(0, 10);
  const started: string[] = [];
  const rearmed: string[] = [];
  const failed: string[] = [];

  // Start runs for campaigns whose date has come round.
  const due = campaigns.filter(
    (c) => c.writer_step === null && c.writer_error === null && c.brand_id && c.idea?.trim() && startsWithinWindow(c.starts_on, today),
  );
  for (const c of due) {
    const { data: blog, error: blogError } = await companyOs
      .from("marketing_content")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("channel", "blog")
      .in("status", ["scheduled", "published"])
      .limit(1);
    if (blogError) {
      failed.push(`${c.name}: ${blogError.message}`);
      continue;
    }
    if (blog && blog.length > 0) continue;
    const begun = await startWriterRun(c.id);
    if (!begun.ok) {
      failed.push(`${c.name}: ${begun.error}`);
      continue;
    }
    const first = await runWriterStep(c.id);
    if ("skipped" in first) failed.push(`${c.name}: ${first.skipped}`);
    else if (!first.ok) failed.push(`${c.name}: ${first.error}`);
    else started.push(c.name);
  }

  // Re-arm runs whose hand-off was dropped. The last step a run recorded is
  // the newest writer-agent run row that names its campaign id.
  const stuck = campaigns.filter((c) => isWriterStep(c.writer_step) && c.writer_error === null);
  if (stuck.length > 0) {
    const runs = await listRoutineRuns(WRITER_ROUTINE_ID, 300);
    const now = Date.now();
    for (const c of stuck) {
      const last = runs.find((r) => (r.summary ?? "").includes(c.id))?.started_at ?? c.writer_started_at;
      if (!isStale(last, now)) continue;
      await kickWriterStep(c.id);
      rearmed.push(c.name);
    }
  }

  if (started.length || rearmed.length || failed.length) {
    const lines: string[] = [];
    if (started.length) lines.push(`Writer started on schedule: ${started.join(", ")}.`);
    if (rearmed.length) lines.push(`Writer re-armed after a dropped hand-off: ${rearmed.join(", ")}.`);
    if (failed.length) lines.push(`Writer could not start: ${failed.join("; ")}.`);
    await notifyOps(lines.join("\n")).catch(() => {});
  }

  return NextResponse.json({ ok: true, checked: campaigns.length, started, rearmed, failed });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
