// Team Coaching Cycle — the daily pass (docs/plans/2026-07-25-team-coaching-cycle.md).
// Mirrors lib/onboarding-cycle.ts: one bearer-authed cron walks every active
// coaching profile and runs four steps, each idempotent so a missed day
// self-heals:
//   1) Prep: a 1-1 is coming up (<= 4 days) -> make sure the scheduled row
//      exists and generate the AI prep once (stamped via prep_generated_at).
//      Every prep made in the pass goes to its coach as a single digest at the
//      end of the run, one email listing all of them, not one per person.
//   2) Overdue: the cadence has lapsed with nothing scheduled -> nudge the
//      coach (repeats weekly, deterministically, not daily).
//   3) Mid-cycle check-in: halfway through the cycle with open commitments and
//      no check-in since the last 1-1 -> AI-written nudge to the member,
//      recorded on coaching_checkins ("one per cycle" = the idempotence).
//   4) Monthly trends: first days of the month -> prior month's report per
//      profile with summarized 1-1s, once (the coaching_trends row is the stamp).
//
// Everything runs on the service-role client; the only caller is the cron
// route. Emails go through sendTransactionalEmail (fail-soft).

import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { readCoachingTranscript, saveCoachingTranscript } from "@/entities/team/modules/coaching/transcript";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { addDays, diffDays } from "@/kernel/config/dates";
import { generateCheckinMessage, generatePrep, generateTrendReport, summarizeMeeting } from "@/entities/team/modules/coaching/ai";
import { coachingMarkdownToHtml } from "@/entities/team/modules/coaching/markdown";
import { fetchMinutesTranscript, larkConfigured, listRecentMinutes, sendLarkDm } from "@/kernel/messaging/lark-api";
import { one } from "@/kernel/config/embedded";

// Every nudge goes out on BOTH channels: a Lark DM (where the team lives)
// and the transactional email (the delivery guarantee). Either failing never
// blocks the other.
async function notifyBoth(input: {
  email: string | null;
  subject: string;
  html: string;
  larkText: string;
  logKind: string;
}): Promise<boolean> {
  const dm = sendLarkDm(input.email, input.larkText);
  const mail = input.email
    ? sendTransactionalEmail({
        to: input.email,
        subject: input.subject,
        html: input.html,
        logMeta: { source: "coaching-cycle", kind: input.logKind },
      })
    : Promise.resolve(false);
  const [dmOk, mailOk] = await Promise.all([dm, mail]);
  return dmOk || Boolean(mailOk);
}

type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
};

const nameOf = (p: PersonEmbed | null): string =>
  p?.preferred_name || p?.full_name || p?.email || "-";

type ProfileRow = {
  id: string;
  coach_id: string;
  cadence_days: number;
  next_one_on_one_on: string | null;
  memberName: string;
  memberEmail: string | null;
};

async function loadActiveProfiles(): Promise<ProfileRow[]> {
  const { data } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, cadence_days, next_one_on_one_on, " +
        "team_members:team_members!team_member_id(status, people:people!person_id(full_name, preferred_name, email))",
    )
    .eq("active", true)
    // coach_id is nullable: a profile can exist for its owner's FAST goals
    // alone (/team/goals) before anyone coaches them. No coach, no 1-1 rhythm
    // to run, so the daily cycle skips it.
    .not("coach_id", "is", null);
  const LIVE = ["active", "pre_start", "on_leave", "notice"];
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      return LIVE.includes((tm?.status as string) ?? "");
    })
    .map((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
      return {
        id: r.id as string,
        coach_id: r.coach_id as string,
        cadence_days: (r.cadence_days as number) ?? 14,
        next_one_on_one_on: (r.next_one_on_one_on as string | null) ?? null,
        memberName: nameOf(person),
        memberEmail: person?.email ?? null,
      };
    });
}

// Coach contacts by team_members id — forward lookup, never the self-FK embed.
async function loadCoachContacts(ids: string[]): Promise<Map<string, { name: string; email: string | null }>> {
  const map = new Map<string, { name: string; email: string | null }>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data } = await companyOs
    .from("team_members")
    .select("id, people:people!person_id(full_name, preferred_name, email)")
    .in("id", unique);
  for (const r of (data ?? []) as Array<{ id: string; people: PersonEmbed | PersonEmbed[] | null }>) {
    const p = one(r.people);
    map.set(r.id, { name: nameOf(p), email: p?.email ?? null });
  }
  return map;
}

export type CoachingRunSummary = {
  date: string;
  profiles: number;
  prepsGenerated: number;
  overdueNudges: number;
  checkinsSent: number;
  trendsGenerated: number;
  minutesMatched: number;
  transcriptsPulled: number;
  recapsDrafted: number;
};

// 0) Lark Minutes sync for one profile: pull transcripts for meetings that
// carry a minutes_token but no transcript yet; for a recent meeting with no
// summary, draft the two-tier recap and tell the coach to review. Historical
// meetings (>14 days) get their transcript stored but are never auto-recapped.
async function syncMinutesForProfile(
  p: ProfileRow,
  coach: { name: string; email: string | null } | undefined,
  profileLink: string,
  todayISO: string,
  summary: CoachingRunSummary,
): Promise<void> {
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on, minutes_token, transcript, meeting_id, summary_markdown")
    .eq("coaching_profile_id", p.id)
    .is("archived_at", null)
    .not("minutes_token", "is", null);
  for (const m of (data ?? []) as Array<{
    id: string;
    held_on: string;
    minutes_token: string;
    meeting_id: string | null;
    transcript: string | null;
    summary_markdown: string | null;
  }>) {
    // Skip sessions whose transcript is already in (the linked meeting's
    // call_transcripts, or the legacy column). This replaces the old
    // `transcript is null` filter now that the text lives on the meeting.
    const existing = (await readCoachingTranscript(m.meeting_id)) ?? m.transcript;
    if (existing && existing.trim()) continue;
    const transcript = await fetchMinutesTranscript(m.minutes_token);
    if (!transcript) continue;
    const saved = await saveCoachingTranscript(m.id, transcript);
    if (!saved.ok) continue;
    summary.transcriptsPulled += 1;
    const recent = diffDays(m.held_on, todayISO) <= 14;
    if (recent && !m.summary_markdown) {
      const res = await summarizeMeeting(m.id);
      if (res.ok) {
        summary.recapsDrafted += 1;
        await notifyBoth({
          email: coach?.email ?? null,
          subject: `1-1 recap drafted: ${p.memberName} (${m.held_on})`,
          html:
            `<p>The transcript of your 1-1 with <strong>${p.memberName}</strong> on <strong>${m.held_on}</strong> came in from Lark Minutes, and the recap is drafted. Review both tiers and publish the shared one when it reads right.</p>` +
            `<p><a href="${profileLink}">Review the recap</a></p>`,
          larkText: `1-1 recap drafted for ${p.memberName} (${m.held_on}). Review and publish: ${profileLink}`,
          logKind: "recap_drafted",
        });
      }
    }
  }
}

// Auto-detect: match recently recorded Minutes to 1-1 rows that have no token
// yet, by member first name in the title + date within a day. Conservative on
// purpose — no match, no write. Returns silently when the tenant app cannot
// list Minutes (the link-paste flow stays the fallback).
async function autoDetectMinutes(profiles: ProfileRow[], summary: CoachingRunSummary): Promise<void> {
  if (!larkConfigured()) return;
  const recent = await listRecentMinutes(4);
  if (recent.length === 0) return;
  for (const minute of recent) {
    const title = (minute.title ?? "").toLowerCase();
    const day = minute.startTime?.slice(0, 10);
    if (!day || !title.includes("1-1")) continue;
    const match = profiles.find((p) => {
      const first = p.memberName.split(/\s+/)[0]?.toLowerCase();
      return first && title.includes(first);
    });
    if (!match) continue;
    const { data: meeting } = await companyOs
      .from("coaching_one_on_ones")
      .select("id, minutes_token")
      .eq("coaching_profile_id", match.id)
      .gte("held_on", addDays(day, -1))
      .lte("held_on", addDays(day, 1))
      .is("archived_at", null)
      .is("minutes_token", null)
      .limit(1)
      .maybeSingle();
    const row = meeting as { id: string } | null;
    if (!row) continue;
    const { error } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        minutes_token: minute.token,
        transcript_source: "minutes_auto",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (!error) summary.minutesMatched += 1;
  }
}

export async function runCoachingCycle(todayISO: string): Promise<CoachingRunSummary> {
  const profiles = await loadActiveProfiles();
  const coaches = await loadCoachContacts(profiles.map((p) => p.coach_id));
  const origin = getSiteOrigin();

  const summary: CoachingRunSummary = {
    date: todayISO,
    profiles: profiles.length,
    prepsGenerated: 0,
    overdueNudges: 0,
    checkinsSent: 0,
    trendsGenerated: 0,
    minutesMatched: 0,
    transcriptsPulled: 0,
    recapsDrafted: 0,
  };

  // Preps generated in this pass, gathered per coach. They go out as one
  // digest at the end of the run rather than an email per person: a coach with
  // four 1-1s on the same day wants one "your prep is ready" note listing all
  // four, not four notes.
  const prepDigest = new Map<string, { date: string; member: string; link: string }[]>();

  // Minutes first: a freshly matched token can yield a transcript and a
  // drafted recap in the same daily pass.
  await autoDetectMinutes(profiles, summary);

  for (const p of profiles) {
    const coach = coaches.get(p.coach_id);
    const profileLink = `${origin}/team/coaching/${p.id}`;

    // 0) Pull any waiting Lark Minutes transcripts and draft recent recaps.
    await syncMinutesForProfile(p, coach, profileLink, todayISO, summary);

    // Last held 1-1 (the cycle clock).
    const { data: lastData } = await companyOs
      .from("coaching_one_on_ones")
      .select("held_on")
      .eq("coaching_profile_id", p.id)
      .eq("status", "held")
      .is("archived_at", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastHeld = (lastData as { held_on: string } | null)?.held_on ?? null;

    // 1) Upcoming 1-1 within 4 days -> ensure the scheduled row + prep + email.
    const next = p.next_one_on_one_on;
    if (next && next >= todayISO && next <= addDays(todayISO, 4)) {
      let { data: meeting } = await companyOs
        .from("coaching_one_on_ones")
        .select("id, prep_markdown, prep_generated_at")
        .eq("coaching_profile_id", p.id)
        .eq("held_on", next)
        .is("archived_at", null)
        .maybeSingle();
      if (!meeting) {
        const { data: created } = await companyOs
          .from("coaching_one_on_ones")
          .insert({ coaching_profile_id: p.id, held_on: next, status: "scheduled" })
          .select("id, prep_markdown, prep_generated_at")
          .maybeSingle();
        meeting = created;
      }
      const m = meeting as { id: string; prep_generated_at: string | null } | null;
      if (m && !m.prep_generated_at) {
        const res = await generatePrep(m.id);
        if (res.ok) {
          summary.prepsGenerated += 1;
          const list = prepDigest.get(p.coach_id) ?? [];
          list.push({ date: next, member: p.memberName, link: profileLink });
          prepDigest.set(p.coach_id, list);
        }
      }
    }

    // 2) Cadence lapsed with nothing on the calendar -> weekly coach nudge.
    if (lastHeld && (!next || next < todayISO)) {
      const since = diffDays(lastHeld, todayISO);
      const lapse = since - p.cadence_days - 3;
      if (lapse >= 0 && lapse % 7 === 0 && coach?.email) {
        const ok = await notifyBoth({
          email: coach.email,
          subject: `1-1 overdue: ${p.memberName} (${since} days since the last one)`,
          html:
            `<p>Your last 1-1 with <strong>${p.memberName}</strong> was <strong>${lastHeld}</strong>, ${since} days ago on a ${p.cadence_days}-day cadence, and nothing is scheduled.</p>` +
            `<p><a href="${profileLink}">Schedule the next one</a>. This reminder repeats weekly.</p>`,
          larkText: `1-1 overdue: ${p.memberName}, ${since} days since the last one. Schedule the next: ${profileLink}`,
          logKind: "overdue_nudge",
        });
        if (ok) summary.overdueNudges += 1;
      }
    }

    // 3) Mid-cycle check-in: halfway through the cycle, open commitments, and
    //    no check-in since the last held 1-1.
    if (lastHeld && p.memberEmail) {
      const half = Math.floor(p.cadence_days / 2);
      const d = diffDays(lastHeld, todayISO);
      if (d >= half && d < p.cadence_days) {
        const { count: openCount } = await companyOs
          .from("coaching_commitments")
          .select("id", { count: "exact", head: true })
          .eq("coaching_profile_id", p.id)
          .in("status", ["open", "on_track", "needs_attention", "blocked"]);
        const { data: recent } = await companyOs
          .from("coaching_checkins")
          .select("id")
          .eq("coaching_profile_id", p.id)
          .gte("sent_at", `${lastHeld}T00:00:00Z`)
          .limit(1);
        if ((openCount ?? 0) > 0 && (recent ?? []).length === 0) {
          const { markdown } = await generateCheckinMessage(p.id);
          const { error } = await companyOs
            .from("coaching_checkins")
            .insert({ coaching_profile_id: p.id, message_markdown: markdown });
          if (!error) {
            const html = await coachingMarkdownToHtml(markdown);
            const ok = await notifyBoth({
              email: p.memberEmail,
              subject: `Mid-cycle check-in${coach ? ` from ${coach.name}` : ""}`,
              html:
                html +
                `<p><a href="${origin}/team/my-coaching">Update your commitments</a></p>`,
              larkText: `${markdown}\n\nUpdate your commitments: ${origin}/team/my-coaching`,
              logKind: "checkin",
            });
            if (ok) summary.checkinsSent += 1;
          }
        }
      }
    }

    // 4) Trend report across the last few 1-1s. Refresh it once the latest
    //    summarized 1-1 (keyed by its month) has no report yet, so it keeps up
    //    with each 1-1 instead of running once a month. Needs 2+ summarized 1-1s.
    const { data: recentHeld } = await companyOs
      .from("coaching_one_on_ones")
      .select("held_on")
      .eq("coaching_profile_id", p.id)
      .eq("status", "held")
      .is("archived_at", null)
      .not("summary_markdown", "is", null)
      .order("held_on", { ascending: false })
      .limit(2);
    const heldRows = (recentHeld ?? []) as Array<{ held_on: string }>;
    if (heldRows.length >= 2) {
      const period = heldRows[0].held_on.slice(0, 7);
      const { data: existing } = await companyOs
        .from("coaching_trends")
        .select("report_markdown")
        .eq("coaching_profile_id", p.id)
        .eq("period", period)
        .maybeSingle();
      const hasReport = Boolean((existing as { report_markdown: string | null } | null)?.report_markdown);
      if (!hasReport) {
        const res = await generateTrendReport(p.id);
        if (res.ok) {
          summary.trendsGenerated += 1;
          await notifyBoth({
            email: coach?.email ?? null,
            subject: `Coaching trends: ${p.memberName}`,
            html:
              `<p>A fresh trend report for <strong>${p.memberName}</strong> is ready, across their last few 1-1s: growth trajectory, recurring themes, follow-through, and flags.</p>` +
              `<p><a href="${profileLink}">Read it on their coaching page</a></p>`,
            larkText: `Coaching trends ready: ${p.memberName}. Read: ${profileLink}`,
            logKind: "trend_ready",
          });
        }
      }
    }
  }

  // One prep digest per coach, after every profile has been walked.
  for (const [coachId, items] of prepDigest) {
    const coach = coaches.get(coachId);
    items.sort((a, b) => a.date.localeCompare(b.date) || a.member.localeCompare(b.member));
    const count = items.length;
    const dates = [...new Set(items.map((i) => i.date))];
    const when = dates.length === 1 ? ` for ${dates[0]}` : "";
    await notifyBoth({
      email: coach?.email ?? null,
      subject: `${count} 1-1 prep${count === 1 ? "" : "s"} ready${when}`,
      html:
        `<p>The prep is ready for ${count === 1 ? "your next 1-1" : `your next ${count} 1-1s`}${when}. Two minutes each to skim:</p>` +
        `<ul>${items
          .map((i) => `<li><a href="${i.link}">${i.member}</a> on <strong>${i.date}</strong></li>`)
          .join("")}</ul>`,
      larkText:
        `${count} 1-1 prep${count === 1 ? "" : "s"} ready${when}:\n` +
        items.map((i) => `- ${i.member} (${i.date}): ${i.link}`).join("\n"),
      logKind: "prep_ready",
    });
  }

  return summary;
}

// ---- pending-recap drafter (hourly) -----------------------------------------
// Draft the recap for a held 1-1 that HAS a transcript and no summary yet,
// WHATEVER put the transcript there: the Minutes pull above, a transcript
// pasted into the coach page, or a scheduled task on Dave's machine writing
// straight to company_os via lark-cli (the route that works without the tenant
// app credentials this cron has never had). Before this, only transcripts the
// daily cron pulled itself were ever summarised, so every other route ended in
// a human remembering to press "Summarize transcript".
//
// ONE meeting per invocation, deliberately. Summarising is an Opus call over a
// ~25k-character transcript; four of them in one pass would run past the
// route's 300s ceiling. Hourly + one-at-a-time drains an afternoon of 1-1s well
// before the next morning and can never time out. Oldest first, so a backlog
// comes out in the order the meetings happened.
//
// Bounded to 14 days: importing a year of history must never trigger a bulk AI
// run over meetings nobody is waiting on.

export type RecapDraftResult = {
  drafted: boolean;
  member?: string;
  heldOn?: string;
  meetingId?: string;
  pendingAfter: number;
  error?: string;
};

export async function draftNextPendingRecap(todayISO: string): Promise<RecapDraftResult> {
  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return { drafted: false, pendingAfter: 0 };
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, coaching_profile_id, held_on")
    .in("coaching_profile_id", [...byId.keys()])
    .eq("status", "held")
    .is("archived_at", null)
    .is("summary_markdown", null)
    .not("transcript", "is", null)
    .gte("held_on", addDays(todayISO, -14))
    .order("held_on", { ascending: true });

  const pending = (data ?? []) as Array<{ id: string; coaching_profile_id: string; held_on: string }>;
  if (pending.length === 0) return { drafted: false, pendingAfter: 0 };

  const m = pending[0];
  const p = byId.get(m.coaching_profile_id);
  if (!p) return { drafted: false, pendingAfter: pending.length };

  const res = await summarizeMeeting(m.id);
  if (!res.ok) {
    // summarizeMeeting stamps ai_error on the row itself; surface it here too
    // so a failing transcript is visible in the cron response, not just the DB.
    return {
      drafted: false,
      member: p.memberName,
      heldOn: m.held_on,
      meetingId: m.id,
      pendingAfter: pending.length,
      error: res.error,
    };
  }

  const coach = (await loadCoachContacts([p.coach_id])).get(p.coach_id);
  const profileLink = `${getSiteOrigin()}/team/coaching/${p.id}`;
  await notifyBoth({
    email: coach?.email ?? null,
    subject: `1-1 recap drafted: ${p.memberName} (${m.held_on})`,
    html:
      `<p>The recap of your 1-1 with <strong>${p.memberName}</strong> on <strong>${m.held_on}</strong> is drafted from the transcript. Read both tiers, then publish the shared one when it reads right, nothing reaches ${p.memberName} until you do.</p>` +
      `<p><a href="${profileLink}">Review and publish</a></p>`,
    larkText: `1-1 recap drafted for ${p.memberName} (${m.held_on}). Review and publish: ${profileLink}`,
    logKind: "recap_drafted",
  });

  return {
    drafted: true,
    member: p.memberName,
    heldOn: m.held_on,
    meetingId: m.id,
    pendingAfter: pending.length - 1,
  };
}
