import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import {
  openReviewCycle,
  reviewMomentsInWindow,
  reviewSurveySlug,
  REVIEW_TYPE_LABEL,
  type ScheduledMoment,
} from "@/lib/reviews";

// The performance-review scheduler (docs/plans/2026-08-12-performance-reviews.md,
// PR 3). Two jobs, run daily by /api/cron/performance-reviews:
//   1. Open cycles whose moment date has just arrived (probation start+6w,
//      mid-year anchor+5m, renewal anchor+11m), emailing both parties.
//   2. Chase open cycles weekly until each side submits.
// Both are stateless: opening is idempotent on the deterministic cycle label,
// reminders fire on a day-count cadence (no "last nudged" column to maintain).

const SITE_ORIGIN = "https://www.edge8.ai";
// How late a moment can be and still auto-open. Covers a missed cron run or a
// contract date filled in a few days late, without retro-opening old moments.
const OPEN_GRACE_DAYS = 21;
// Members who count for scheduling. pre_start has not begun; terminated/alumni
// have left.
const SCHEDULED_STATUSES = ["active", "on_leave", "notice"];
// Weekly reminder cadence and the point we stop nagging.
const REMINDER_EVERY_DAYS = 7;
const REMINDER_MAX_DAYS = 42;

type NameEmail = { full_name: string | null; first_name: string | null; preferred_name: string | null; email: string | null };
const displayName = (p: NameEmail | null, fallback: string) =>
  p?.preferred_name || p?.first_name || p?.full_name || fallback;

function selfEmailHtml(typeName: string, link: string): string {
  return (
    `<p>It is time for your ${typeName.toLowerCase()}.</p>` +
    `<p>Please complete your self-assessment. Your manager sees it only after they finish their own review.</p>` +
    `<p><a href="${link}">Start your self-assessment</a></p>` +
    `<p>You can also find it under Reviews in the team portal.</p>`
  );
}
function managerEmailHtml(typeName: string, subjectName: string, link: string): string {
  return (
    `<p>A ${typeName.toLowerCase()} for <strong>${subjectName}</strong> is ready.</p>` +
    `<p>Draft your review, then finalize it. ${subjectName} sees it only once finalized.</p>` +
    `<p><a href="${link}">Start the review</a></p>`
  );
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

export type SchedulerResult = {
  date: string;
  opened: { name: string; type: string }[];
  remindersSent: number;
  skippedNoManager: string[];
};

// dryRun previews what would open and how many reminders would fire without
// inserting any row or sending any email — used to sanity-check the daily
// volume before/while the cron is live (exposed via ?dry=1 on the route).
export async function runReviewScheduler(
  todayISO: string,
  opts: { dryRun?: boolean } = {},
): Promise<SchedulerResult> {
  const dryRun = opts.dryRun === true;
  const opened: { name: string; type: string }[] = [];
  const skippedNoManager: string[] = [];

  // ---- 1. open newly-due cycles --------------------------------------------

  const { data: memberData } = await companyOs
    .from("team_members")
    .select("id, manager_id, start_date, contract_start_date, people!person_id(full_name, first_name, preferred_name, email)")
    .in("status", SCHEDULED_STATUSES);
  const members = (memberData ?? []) as Array<{
    id: string;
    manager_id: string | null;
    start_date: string | null;
    contract_start_date: string | null;
    people: NameEmail | NameEmail[] | null;
  }>;

  // Which members already have a probation review (so we never re-open one).
  const { data: probationRows } = await companyOs
    .from("performance_reviews")
    .select("team_member_id")
    .eq("review_type", "probation");
  const hasProbation = new Set((probationRows ?? []).map((r) => (r as { team_member_id: string }).team_member_id));

  // Resolve manager emails in one batch (forward lookup on the id, never the
  // reverse-embedding PostgREST self-FK).
  const managerIds = [...new Set(members.map((m) => m.manager_id).filter((x): x is string => !!x))];
  const managerById = new Map<string, NameEmail>();
  if (managerIds.length) {
    const { data } = await companyOs
      .from("team_members")
      .select("id, people!person_id(full_name, first_name, preferred_name, email)")
      .in("id", managerIds);
    for (const r of (data ?? []) as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      if (p) managerById.set(r.id, p);
    }
  }

  for (const m of members) {
    const person = Array.isArray(m.people) ? m.people[0] ?? null : m.people;
    const subjectName = displayName(person, "Team member");
    const moments: ScheduledMoment[] = reviewMomentsInWindow({
      startDate: m.start_date ? m.start_date.slice(0, 10) : null,
      contractStartDate: m.contract_start_date ? m.contract_start_date.slice(0, 10) : null,
      hasProbationReview: hasProbation.has(m.id),
      todayISO,
      graceDays: OPEN_GRACE_DAYS,
    });
    if (moments.length === 0) continue;
    if (!m.manager_id) {
      for (const _ of moments) skippedNoManager.push(subjectName);
      continue;
    }

    for (const moment of moments) {
      if (dryRun) {
        // Report only cycles that don't yet exist, matching what a real run
        // would newly open.
        const { data: existing } = await companyOs
          .from("performance_reviews")
          .select("id")
          .eq("team_member_id", m.id)
          .eq("cycle_label", moment.cycleLabel)
          .limit(1);
        if ((existing ?? []).length === 0) opened.push({ name: subjectName, type: moment.type });
        continue;
      }
      const cycle = await openReviewCycle({
        teamMemberId: m.id,
        managerId: m.manager_id,
        reviewType: moment.type,
        cycleLabel: moment.cycleLabel,
      });
      // created 0 means the cycle already existed: skip the emails so a
      // re-run never re-notifies.
      if (cycle.created === 0 || !cycle.selfId || !cycle.managerId) continue;

      const typeName = REVIEW_TYPE_LABEL[moment.type];
      const manager = managerById.get(m.manager_id) ?? null;
      if (person?.email) {
        await sendTransactionalEmail({
          to: [person.email],
          subject: `${typeName}: your self-assessment`,
          html: selfEmailHtml(typeName, `${SITE_ORIGIN}/surveys/perf-review-self?review=${cycle.selfId}`),
          logMeta: { kind: "review_open_self", teamMemberId: m.id, type: moment.type },
        });
      }
      if (manager?.email) {
        const slug = reviewSurveySlug({ rater_kind: "manager", review_type: moment.type });
        await sendTransactionalEmail({
          to: [manager.email],
          subject: `${typeName} to complete: ${subjectName}`,
          html: managerEmailHtml(typeName, subjectName, `${SITE_ORIGIN}/surveys/${slug}?review=${cycle.managerId}`),
          logMeta: { kind: "review_open_manager", teamMemberId: m.id, type: moment.type },
        });
      }
      opened.push({ name: subjectName, type: moment.type });
    }
  }

  // ---- 2. weekly reminders on unfinished cycles ----------------------------

  // Rows still awaiting the rater (open/draft), opened between one week and the
  // nag ceiling ago, on a 7-day multiple. Portal cycles only (imports are
  // finalized). The row's own rater is the recipient.
  const { data: pendingData } = await companyOs
    .from("performance_reviews")
    .select("id, team_member_id, reviewer_id, review_type, rater_kind, created_at")
    .eq("source", "portal")
    .in("status", ["open", "draft"]);
  const pending = (pendingData ?? []) as Array<{
    id: string;
    team_member_id: string;
    reviewer_id: string | null;
    review_type: string;
    rater_kind: string;
    created_at: string;
  }>;

  // Batch-resolve the recipients (subjects for self rows, reviewers for manager
  // rows) to emails.
  const dueReminders = pending.filter((r) => {
    const age = daysBetween(r.created_at.slice(0, 10), todayISO);
    return age >= REMINDER_EVERY_DAYS && age <= REMINDER_MAX_DAYS && age % REMINDER_EVERY_DAYS === 0;
  });
  const recipientTmIds = [
    ...new Set(
      dueReminders.map((r) => (r.rater_kind === "self" ? r.team_member_id : r.reviewer_id)).filter((x): x is string => !!x),
    ),
  ];
  const emailByTm = new Map<string, NameEmail>();
  if (recipientTmIds.length) {
    const { data } = await companyOs
      .from("team_members")
      .select("id, people!person_id(full_name, first_name, preferred_name, email)")
      .in("id", recipientTmIds);
    for (const r of (data ?? []) as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      if (p) emailByTm.set(r.id, p);
    }
  }
  // Subject names for the manager-reminder copy.
  const subjectNameByTm = new Map<string, string>();
  const subjectTmIds = [...new Set(dueReminders.map((r) => r.team_member_id))];
  if (subjectTmIds.length) {
    const { data } = await companyOs
      .from("team_members")
      .select("id, people!person_id(full_name, first_name, preferred_name, email)")
      .in("id", subjectTmIds);
    for (const r of (data ?? []) as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      subjectNameByTm.set(r.id, displayName(p, "your report"));
    }
  }

  let remindersSent = 0;
  for (const r of dueReminders) {
    const recipientTm = r.rater_kind === "self" ? r.team_member_id : r.reviewer_id;
    if (!recipientTm) continue;
    const recipient = emailByTm.get(recipientTm);
    if (!recipient?.email) continue;
    const typeName = REVIEW_TYPE_LABEL[r.review_type as keyof typeof REVIEW_TYPE_LABEL] ?? "Performance review";
    const slug = reviewSurveySlug({ rater_kind: r.rater_kind, review_type: r.review_type });
    if (dryRun) {
      remindersSent += 1;
      continue;
    }
    const link = `${SITE_ORIGIN}/surveys/${slug}?review=${r.id}`;
    const html =
      r.rater_kind === "self"
        ? `<p>A quick reminder: your ${typeName.toLowerCase()} self-assessment is still open.</p>` +
          `<p><a href="${link}">Complete it now</a></p>`
        : `<p>A quick reminder: the ${typeName.toLowerCase()} for <strong>${subjectNameByTm.get(r.team_member_id) ?? "your report"}</strong> is still open.</p>` +
          `<p><a href="${link}">Complete it now</a></p>`;
    const ok = await sendTransactionalEmail({
      to: [recipient.email],
      subject: `Reminder: ${typeName} still open`,
      html,
      logMeta: { kind: "review_reminder", reviewId: r.id, rater: r.rater_kind },
    });
    if (ok) remindersSent += 1;
  }

  return { date: todayISO, opened, remindersSent, skippedNoManager };
}
