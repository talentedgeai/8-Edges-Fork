import { agentRunLoop } from "../run-loop";
import { advance } from "./advance";
import { loadBlogAsset } from "./data";
import { describeState, WRITER_DONE, WRITER_READY } from "./steps";

// The writer agent's run, as the shared run loop executes it (lib/run-loop.ts
// owns the hand-off). The writer runs on demand, never on a schedule: after a
// step passes the loop calls the step route below for the next one, so a run
// chains through the process with nothing polling and no open browser tab.
// What is the writer's here: which states park a run and what ops hears then.

export const WRITER_ROUTINE_ID = "/api/cron/writer-agent/";

const loop = agentRunLoop({
  tag: "writer",
  routineId: WRITER_ROUTINE_ID,
  advance,
  // ready: the post passed every check and waits for a person to publish.
  // done: every channel is written and the post is live or scheduled.
  parked: async (r) => {
    if (r.next === WRITER_READY) return `Writer agent: campaign ${r.campaignId} is ready to publish. Every check passed.`;
    if (r.next === WRITER_DONE) {
      const blog = await loadBlogAsset(r.campaignId);
      const live = blog.ok && blog.data.postedUrl ? blog.data.postedUrl : "(live URL not recorded)";
      return `Writer agent: campaign ${r.campaignId} published. ${live}`;
    }
    return null;
  },
  stopped: (r) => `Writer agent: campaign ${r.campaignId} stopped at ${describeState(r.step)}. ${r.error}`,
});

export const kickWriterStep = loop.kick;
export const runWriterStep = loop.run;
