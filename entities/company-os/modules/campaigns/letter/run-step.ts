import { waitUntil } from "@vercel/functions";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyOps } from "@/kernel/messaging/lark";
import { advanceLetter, type AdvanceResult } from "./advance";
import { describeLetterState, LETTER_READY } from "./steps";

// One step of a letter agent run, then the hand-off: after a step passes this
// makes one authenticated call to its own step route for the next step, so a
// run chains through the process with nothing polling. When it parks at ready
// or stops, ops hears once. Same pattern as the writer agent's run-step.

export const LETTER_ROUTINE_ID = "/api/cron/letter-agent/";
const HANDOFF_HOLD_MS = 3_000;

export async function kickLetterStep(campaignId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[letter] CRON_SECRET is not set; the run cannot hand itself on.");
    return;
  }
  const request = fetch(`${getSiteOrigin()}${LETTER_ROUTINE_ID}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ campaignId }),
  }).then(
    (res) => {
      if (!res.ok) console.error(`[letter] hand-off for ${campaignId} answered ${res.status}`);
    },
    (err) => console.error("[letter] hand-off failed:", err instanceof Error ? err.message : String(err)),
  );
  waitUntil(request);
  await Promise.race([request, new Promise<void>((r) => setTimeout(r, HANDOFF_HOLD_MS))]);
}

export async function runLetterStep(campaignId: string): Promise<AdvanceResult> {
  const result = await advanceLetter(campaignId);
  if ("skipped" in result) return result;
  if (result.ok) {
    if (result.next === LETTER_READY) {
      await notifyOps(`Letter agent: broadcast ${campaignId} is ready for approval. ${result.summary}`);
    } else {
      await kickLetterStep(campaignId);
    }
    return result;
  }
  await notifyOps(`Letter agent: broadcast ${campaignId} stopped at ${describeLetterState(result.step)}. ${result.error}`);
  return result;
}
