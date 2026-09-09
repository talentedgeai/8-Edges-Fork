// The six onboarding-cycle milestones, lifted out of ./cycle so that file is the
// daily driver (load the rows, resolve the context, walk the list, advance the
// stage) and this one is the rules for each moment. Behaviour is unchanged: the
// order below is the order the cron has always run, and every idempotency stamp
// is written exactly where it was.
//
// Nothing here imports ./cycle at runtime. The two writes a milestone needs
// (`patchJourney`, `recruiterEmailFor`) arrive on the context instead, so the
// dependency runs one way and the milestones can be tested with plain stubs.

import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { recordAudit } from "@/kernel/audit/audit";
import { addDays } from "@/kernel/config/dates";
import { updateTeamMembers } from "@/kernel/identity/writes";
import type { Contact, CycleRow, CycleRunSummary } from "./cycle";
import { DAY8_SURVEY_SLUG, TALENT_DIRECTOR_EMAIL } from "./cycle-constants";

// Everything one milestone needs about the row it is looking at, resolved once
// per row by the driver below.
export type MilestoneCtx = {
  todayISO: string;
  // Day number on the cycle clock (start_date is Day 1).
  d: number;
  start: string;
  // When probation ends: the stored date, else start + 59 days.
  probEnd: string;
  manager: Contact | undefined;
  name: string;
  origin: string;
  boardLink: string;
  // Someone already confirmed full time (promoted before this feature, or by
  // an admin directly) rides the board to Day 180 but must never re-enter the
  // review/decision flow.
  alreadyFullTime: boolean;
  // Mutated in place; the driver returns it.
  summary: CycleRunSummary;
  // The journey write and the recruiter lookup, injected by the driver.
  patchJourney: (id: string, patch: Record<string, unknown>) => Promise<void>;
  recruiterEmailFor: (personId: string | null) => Promise<string | null>;
};

// A milestone returns true when it has closed the journey out and the driver
// should stop working this row (only Day 180 ever does).
export type Milestone = (row: CycleRow, ctx: MilestoneCtx) => Promise<boolean>;

// 1) Plan-link nag: the 7 days before Day 1, daily, deliberately
//    stateless — it repeats until the plan link is added.
export async function planNagMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, start, name, manager, boardLink, summary } = ctx;
  if (d >= -6 && d <= 0 && !row.plan_url && !row.plan_path && manager?.email) {
    const ok = await sendTransactionalEmail({
      to: [manager.email, TALENT_DIRECTOR_EMAIL],
      subject: `Onboarding plan needed before Day 1: ${name}`,
      html:
        `<p><strong>${name}</strong> starts on <strong>${start}</strong> (${1 - d} day${1 - d === 1 ? "" : "s"} away) and their onboarding plan link is not added yet.</p>` +
        `<p>Every new hire needs their plan in place one week before Day 1. This reminder repeats daily until the link is added.</p>` +
        `<p><a href="${boardLink}">Add it on your Onboarding board</a></p>`,
      logMeta: { source: "onboarding-cycle", kind: "plan_nag" },
    });
    if (ok) summary.planNags += 1;
  }
  return false;
}

// 2) Day 8 feedback survey to the new hire. Only worth sending while the
//    first weeks are fresh: past day 30 (journeys backfilled long after
//    start) stamp it as handled instead of sending a "one week in" email
//    to someone two months in.
export async function day8SurveyMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, name, origin, summary } = ctx;
  if (d > 30 && !row.day8_survey_sent_at) {
    await ctx.patchJourney(row.id, { day8_survey_sent_at: new Date().toISOString() });
  } else if (d >= 8 && !row.day8_survey_sent_at && row.member.email) {
    const ok = await sendTransactionalEmail({
      to: row.member.email,
      subject: "One week in — 3 quick questions",
      html:
        `<p>Hi ${name},</p>` +
        `<p>You are one week into Arca Wellness. Three quick questions (about a minute) so we can fix anything that is not working:</p>` +
        `<p><a href="${origin}/surveys/${DAY8_SURVEY_SLUG}">Answer the Day 8 survey</a></p>` +
        `<p>Your manager and the talent team read every response.</p>`,
      logMeta: { source: "onboarding-cycle", kind: "day8_survey" },
    });
    if (ok) {
      await ctx.patchJourney(row.id, { day8_survey_sent_at: new Date().toISOString() });
      summary.day8Sent += 1;
    }
  }
  return false;
}

// 3) Probation review to the manager, 15 days before probation ends
//    (Day 45 on the default 60-day window; re-armed by an extension).
export async function day45ReviewMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, name, origin, alreadyFullTime, summary } = ctx;
  if (
    todayISO >= addDays(probEnd, -15) &&
    !row.day45_email_sent_at &&
    !row.decision &&
    !row.day60_promoted_at &&
    !alreadyFullTime &&
    manager?.email
  ) {
    const ok = await sendTransactionalEmail({
      to: manager.email,
      subject: `Probation review due: ${name}`,
      html:
        `<p><strong>${name}</strong>${row.member.positionTitle ? ` (${row.member.positionTitle})` : ""} finishes probation on <strong>${probEnd}</strong>.</p>` +
        `<p>Record your decision — offer full time, extend probation 30 days, or terminate.</p>` +
        `<p><a href="${origin}/team/probation/${row.team_member_id}">Record the decision</a></p>`,
      logMeta: { source: "onboarding-cycle", kind: "day45_review" },
    });
    if (ok) {
      await ctx.patchJourney(row.id, { day45_email_sent_at: new Date().toISOString() });
      summary.reviewsSent += 1;
    }
  }
  return false;
}

// 4) Decision overdue: 5 days before probation ends with no decision on
//    file — daily, stateless, CC the talent director. Nothing promotes
//    automatically until a human decides.
export async function decisionReminderMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, name, origin, alreadyFullTime, summary } = ctx;
  if (
    todayISO >= addDays(probEnd, -5) &&
    !row.decision &&
    !row.day60_promoted_at &&
    !alreadyFullTime &&
    manager?.email
  ) {
    const ok = await sendTransactionalEmail({
      to: [manager.email, TALENT_DIRECTOR_EMAIL],
      subject: `Probation decision overdue: ${name}`,
      html:
        `<p><strong>${name}</strong>'s probation ends on <strong>${probEnd}</strong> and no decision is recorded.</p>` +
        `<p>Nothing happens automatically until you decide. This reminder repeats daily.</p>` +
        `<p><a href="${origin}/team/probation/${row.team_member_id}">Record the decision</a></p>`,
      logMeta: { source: "onboarding-cycle", kind: "decision_reminder" },
    });
    if (ok) summary.decisionReminders += 1;
  }
  return false;
}

// 5) Day 60 promotion: probation over + manager passed them -> full time,
//    congratulations to the hire, CC manager + recruiter. Someone already
//    full time just gets the marker stamped quietly — no writes, no email.
export async function day60PromotionMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, name, alreadyFullTime, summary } = ctx;
  if (alreadyFullTime && !row.day60_promoted_at) {
    await ctx.patchJourney(row.id, { day60_promoted_at: new Date().toISOString() });
  } else if (todayISO >= probEnd && row.decision === "offer_full_time" && !row.day60_promoted_at) {
    const statusPatch = row.member.status === "pre_start" ? { status: "active" } : {};
    const { error } = await updateTeamMembers({ employment_stage: "full_time", ...statusPatch })
      .eq("id", row.team_member_id);
    if (!error) {
      await ctx.patchJourney(row.id, { day60_promoted_at: new Date().toISOString() });
      await recordAudit({
        table: "team_members",
        recordId: row.team_member_id,
        operation: "update",
        actor: "onboarding-cycle",
        context: { action: "day60_promotion", probation_end: probEnd },
      });
      summary.promoted += 1;
      if (row.member.email) {
        const recruiter = await ctx.recruiterEmailFor(row.member.personId);
        const cc = [...new Set([manager?.email, recruiter ?? TALENT_DIRECTOR_EMAIL].filter(
          (e): e is string => Boolean(e),
        ))];
        await sendTransactionalEmail({
          to: [row.member.email, ...cc],
          subject: `Congratulations ${name} — you're a full-time Arca Wellness team member!`,
          html:
            `<p>Hi ${name},</p>` +
            `<p><strong>Congratulations!</strong> You passed probation and as of today you are a full-time member of the Arca Wellness team.</p>` +
            `<p>Thank you for everything you have put in over your first 60 days — we are glad you are here.</p>` +
            `<p>— The Arca Wellness team</p>`,
          logMeta: { source: "onboarding-cycle", kind: "day60_congrats" },
        });
      }
    } else {
      console.error("[onboarding-cycle] promotion failed:", error.message);
    }
  }
  return false;
}

// 6) Day 180: prompt the Talent Director for the stay interview, close the
//    journey.
export async function day180StayMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, start, name, summary } = ctx;
  if (d >= 180 && !row.day180_email_sent_at) {
    const ok = await sendTransactionalEmail({
      to: TALENT_DIRECTOR_EMAIL,
      subject: `180-day stay interview: ${name}`,
      html:
        `<p><strong>${name}</strong>${row.member.positionTitle ? ` (${row.member.positionTitle})` : ""} hits 180 days on <strong>${addDays(start, 179)}</strong>.</p>` +
        `<p>Time for their stay interview: what keeps them here, what would make them leave, what should change.</p>`,
      logMeta: { source: "onboarding-cycle", kind: "day180_stay" },
    });
    if (ok) {
      await ctx.patchJourney(row.id, {
        day180_email_sent_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        stage: "complete",
      });
      summary.day180Sent += 1;
      return true; // journey closed; nothing further to do for this row
    }
  }
  return false;
}

// The milestones in the order the cron has always run them. Order matters: the
// idempotency stamps each one writes are read by the ones after it (a Day 60
// promotion stamped here is what stops the Day 45 nag next run).
export const MILESTONES: Milestone[] = [
  planNagMilestone,
  day8SurveyMilestone,
  day45ReviewMilestone,
  decisionReminderMilestone,
  day60PromotionMilestone,
  day180StayMilestone,
];
