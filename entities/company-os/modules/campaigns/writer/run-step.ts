import { waitUntil } from "@vercel/functions";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyOps } from "@/kernel/messaging/lark";
import { advance, type AdvanceResult } from "./advance";
import { loadBlogAsset } from "./data";
import { describeState, WRITER_DONE, WRITER_READY } from "./steps";

// One step of a writer run, as the app executes it, then the hand-off. The
// writer runs on demand, never on a schedule: after a step passes, this
// function makes one authenticated call to its own step route for the next
// step, so a run chains through the process with nothing polling and no open
// browser tab. When a run ends, ready or stopped, ops hears about it once.
// Recording as a routine run (Settings -> Agents, with tokens) is the caller's
// job: withRoutineRun in the step route, recordRoutineRun in the hub action.

export const WRITER_ROUTINE_ID = "/api/cron/writer-agent/";

// How long the caller stays with the hand-off before returning: long enough
// for the request to connect and be accepted, well short of the step itself.
const HANDOFF_HOLD_MS = 3_000;

// Fire the next step without waiting for it to finish. The server holds
// CRON_SECRET, so it may call the step route the way Vercel Cron would. The
// caller holds for a few seconds so the request is on the wire before its own
// response goes out (in the first real run one hand-off of six never arrived,
// with nothing logged on either side), and waitUntil keeps the function alive
// for the rest. The next step's function then owns the run.
export async function kickWriterStep(campaignId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[writer] CRON_SECRET is not set; the run cannot hand itself on.");
    return;
  }
  const url = `${getSiteOrigin()}${WRITER_ROUTINE_ID}`;
  const request = fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ campaignId }),
  }).then(
    (res) => {
      if (!res.ok) console.error(`[writer] hand-off for ${campaignId} answered ${res.status}`);
    },
    (err) => console.error("[writer] hand-off failed:", err instanceof Error ? err.message : String(err)),
  );
  waitUntil(request);
  await Promise.race([request, new Promise<void>((r) => setTimeout(r, HANDOFF_HOLD_MS))]);
}

export async function runWriterStep(campaignId: string): Promise<AdvanceResult> {
  const result = await advance(campaignId);
  if ("skipped" in result) return result;
  if (result.ok) {
    if (result.next === WRITER_READY) {
      await notifyOps(`Writer agent: campaign ${campaignId} is ready to publish. Every check passed.`);
    } else if (result.next === WRITER_DONE) {
      const blog = await loadBlogAsset(campaignId);
      const live = blog.ok && blog.data.postedUrl ? blog.data.postedUrl : "(live URL not recorded)";
      await notifyOps(`Writer agent: campaign ${campaignId} published. ${live}`);
    } else {
      await kickWriterStep(campaignId);
    }
    return result;
  }
  await notifyOps(`Writer agent: campaign ${campaignId} stopped at ${describeState(result.step)}. ${result.error}`);
  return result;
}
