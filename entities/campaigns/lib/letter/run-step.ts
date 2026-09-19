import { agentRunLoop } from "../run-loop";
import { advanceLetter } from "./advance";
import { scheduleLetter } from "./approve";
import { describeLetterState, LETTER_READY } from "./steps";

// The letter agent's run, as the shared run loop executes it (lib/run-loop.ts
// owns the hand-off). What is the letter's here: when a run passes every check
// the agent schedules the letter itself (no approval step), and the Marketing
// chat hears it is ready for review, when it goes out, and where it stopped.

export const LETTER_ROUTINE_ID = "/api/cron/letter-agent/";

function reviewLink(campaignId: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/revenue/marketing/broadcasts/${campaignId}/`;
}

function inCompanyTime(iso: string): string {
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return `${when} GMT+7`;
}

async function readyForReview(r: { campaignId: string; summary: string }): Promise<string> {
  const scheduled = await scheduleLetter(r.campaignId);
  if (!scheduled.ok) {
    return `Letter agent: broadcast ${r.campaignId} passed every check but could not be scheduled: ${scheduled.error} Review and approve it by hand: ${reviewLink(r.campaignId)}`;
  }
  const when = scheduled.firstSendAt ? `from ${inCompanyTime(scheduled.firstSendAt)}, 8am in each reader's time zone` : "on the next Tuesday or Friday at 8am";
  return `Letter agent: this week's broadcast is ready for review. It sends to ${scheduled.recipients} people ${when}, unless it is cancelled first. ${r.summary} Review or cancel: ${reviewLink(r.campaignId)}`;
}

const loop = agentRunLoop({
  tag: "letter",
  routineId: LETTER_ROUTINE_ID,
  advance: advanceLetter,
  parked: (r) => (r.next === LETTER_READY ? readyForReview(r) : null),
  stopped: (r) => `Letter agent: broadcast ${r.campaignId} stopped at ${describeLetterState(r.step)}. ${r.error}`,
});

export const kickLetterStep = loop.kick;
export const runLetterStep = loop.run;
