import { agentRunLoop } from "../run-loop";
import { advanceLetter } from "./advance";
import { describeLetterState, LETTER_READY } from "./steps";

// The letter agent's run, as the shared run loop executes it (lib/run-loop.ts
// owns the hand-off). What is the letter's here: the one state that parks a
// run — ready, waiting for a person's approval; the agent never sends — and
// what ops hears when it parks or stops.

export const LETTER_ROUTINE_ID = "/api/cron/letter-agent/";

const loop = agentRunLoop({
  tag: "letter",
  routineId: LETTER_ROUTINE_ID,
  advance: advanceLetter,
  parked: (r) => (r.next === LETTER_READY ? `Letter agent: broadcast ${r.campaignId} is ready for approval. ${r.summary}` : null),
  stopped: (r) => `Letter agent: broadcast ${r.campaignId} stopped at ${describeLetterState(r.step)}. ${r.error}`,
});

export const kickLetterStep = loop.kick;
export const runLetterStep = loop.run;
