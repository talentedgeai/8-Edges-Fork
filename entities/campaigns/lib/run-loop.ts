import { waitUntil } from "@vercel/functions";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyOps } from "@/kernel/messaging/lark";

// How an agent run chains through its steps, written once for the writer and
// the letter agents (A.2). Each agent advances one step per function
// invocation; after a passing step the run hands itself on to the next step
// and, when it parks or stops, ops hears about it once. The two agents used to
// carry this mechanism as two near-identical files, and the hand-off was
// changed in lockstep in both (abbfa6db, then fb270935) — the cost of a rule
// with two homes. An agent now supplies what differs: its advance function,
// its routine id, and the words for a parked or stopped run.
//
// Recording as a routine run (Settings -> Agents, with tokens) is the caller's
// job: withRoutineRun in the step route, recordRoutineRun in the hub action.

// What one step reports. `ok` with a `next` state means the step passed and
// says what runs next (a step id) or where the run parked (a state that is not
// a step); `ok: false` is a failed check; `skipped` is a tick with nothing to
// do — no run on this campaign, or a run that is already parked.
export type StepResult<Step extends string, State extends string> =
  | { ok: true; campaignId: string; step: Step; next: State; summary: string }
  | { ok: false; campaignId: string; step: Step; error: string }
  | { skipped: string; campaignId: string };

export type AgentRunDefinition<Step extends string, State extends string> = {
  // The log prefix, "[writer]" or "[letter]".
  tag: string;
  // The agent's own step route, which the hand-off POSTs to.
  routineId: string;
  advance: (campaignId: string) => Promise<StepResult<Step, State>>;
  // The message for ops when a passing step leaves the run parked at `next`,
  // or null when `next` is a step to hand on to.
  parked: (result: Extract<StepResult<Step, State>, { ok: true }>) => Promise<string | null> | string | null;
  // The message for ops when a step's check fails.
  stopped: (result: Extract<StepResult<Step, State>, { ok: false }>) => string;
};

// How long the caller stays with the hand-off before returning: long enough
// for the request to connect and be accepted, well short of the step itself.
const HANDOFF_HOLD_MS = 3_000;

export function agentRunLoop<Step extends string, State extends string>(def: AgentRunDefinition<Step, State>) {
  // Fire the next step without waiting for it to finish. The server holds
  // CRON_SECRET, so it may call the step route the way Vercel Cron would. The
  // caller holds for a few seconds so the request is on the wire before its
  // own response goes out (in the first real run one hand-off of six never
  // arrived, with nothing logged on either side), and waitUntil keeps the
  // function alive for the rest. The next step's function then owns the run.
  //
  // That call needs the site's public origin. A request that arrived on the
  // deployment host (every cron does) has none, and the deployment host itself
  // sits behind Vercel SSO, so calling it answers 401. In that case the next
  // step runs inside this function instead, kept alive by waitUntil; the chain
  // continues here until the run parks, stops, or the function's time runs
  // out, and the hourly schedule re-arms whatever is left.
  async function kick(campaignId: string): Promise<void> {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.error(`[${def.tag}] CRON_SECRET is not set; the run cannot hand itself on.`);
      return;
    }
    const origin = getSiteOrigin();
    if (!origin) {
      console.warn(`[${def.tag}] no public origin for the hand-off; running the next step for ${campaignId} in this function.`);
      waitUntil(run(campaignId));
      return;
    }
    const request = fetch(`${origin}${def.routineId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ campaignId }),
    }).then(
      (res) => {
        if (!res.ok) console.error(`[${def.tag}] hand-off for ${campaignId} answered ${res.status}`);
      },
      (err) => console.error(`[${def.tag}] hand-off failed:`, err instanceof Error ? err.message : String(err)),
    );
    waitUntil(request);
    await Promise.race([request, new Promise<void>((r) => setTimeout(r, HANDOFF_HOLD_MS))]);
  }

  async function run(campaignId: string): Promise<StepResult<Step, State>> {
    const result = await def.advance(campaignId);
    if ("skipped" in result) return result;
    if (result.ok) {
      const parked = await def.parked(result);
      if (parked) await notifyOps(parked);
      else await kick(campaignId);
      return result;
    }
    await notifyOps(def.stopped(result));
    return result;
  }

  return { kick, run };
}
