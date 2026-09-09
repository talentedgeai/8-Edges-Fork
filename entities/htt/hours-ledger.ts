// The human hours ledger: the server side of the hours rule in day-hours.ts.
//
// Sessions arrive from the telemetry ingest (live plugin or local backfill) and
// are stored in htt.work_sessions. Every time a person's sessions change, the
// days they touch are recomputed across ALL of that person's repos and written
// to htt.man_hour_entries as one `auto_session` row per (person, repo, day):
// final hours in `hours`, the pre-budget figure in `measured_hours`, and what
// it rests on in `evidence`. A person's override is a `manual` row for the same
// key; while one exists the auto row is `excluded`, so the delivered-hours sum
// (status <> 'excluded') reads the override and nothing else.
//
// This is the only writer of man_hour_entries and work_sessions; surfaces in
// other entities reach it through the htt index.
import { companyOs, htt } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { selectAll } from "./select-all";
import {
  computeDayHoursV2,
  humanRunIntervals,
  unattendedIntervals,
  HUMAN_GAP_MS,
  UNATTENDED_WEIGHT,
  localDay,
  tzOffsetMinutes,
  DEFAULT_FOCUS_HOURS,
  type HumanTurn,
  type RepoSessions,
  type SessionInterval,
  bridgeNeedsReview,
} from "./day-hours";
import type { LedgerRow } from "./ledger-types";
import { loadPrsForBranches, parseIntervals, parseTurns } from "./hours-evidence";

type Result = { ok: true } | { ok: false; error: string };

export type WorkSessionInput = {
  companyId: string;
  repoId: string;
  personId: string | null;
  sessionId: string;
  tool?: string | null;
  startedAt: string;
  endedAt: string | null;
  activeIntervals: SessionInterval[];
  /** Every line the person typed (edge8-telemetry 1.4.0+); [] for older recorders. */
  humanTurns?: HumanTurn[];
  tokensTotal: number;
};

type PersonProfile = { offsetMinutes: number; budget: number };

async function loadProfile(personId: string): Promise<PersonProfile> {
  const { data, error } = await companyOs
    .from("people")
    .select("timezone, daily_focus_hours")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(`people read failed: ${error.message}`);
  return {
    offsetMinutes: tzOffsetMinutes(data?.timezone ?? null),
    budget: data?.daily_focus_hours != null ? Number(data.daily_focus_hours) : DEFAULT_FOCUS_HOURS,
  };
}

/** The local days a set of intervals touches, for the person's timezone. */
export function daysTouched(intervals: SessionInterval[], offsetMinutes: number): string[] {
  const days = new Set<string>();
  for (const iv of intervals) {
    const a = Date.parse(iv.start);
    const b = Date.parse(iv.end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    for (let t = a; t <= b; t += 86_400_000) days.add(localDay(t, offsetMinutes));
    days.add(localDay(b, offsetMinutes));
  }
  return [...days].sort();
}

/** Store or refresh one session, keyed on its session id. Returns the local
 *  days the session touches so the caller can recompute them. */
export async function upsertWorkSession(input: WorkSessionInput): Promise<string[]> {
  const offset = input.personId ? (await loadProfile(input.personId)).offsetMinutes : tzOffsetMinutes(null);
  const days = daysTouched(input.activeIntervals, offset);
  const { error } = await htt.from("work_sessions").upsert(
    {
      company_id: input.companyId,
      repo_id: input.repoId,
      person_id: input.personId,
      session_id: input.sessionId,
      tool: input.tool ?? "claude-code",
      started_at: input.startedAt,
      ended_at: input.endedAt,
      active_intervals: input.activeIntervals as unknown as Json,
      human_turns: (input.humanTurns ?? []).map((h) => ({ t: h.t, branch: h.branch, run_end: h.runEnd ?? null })) as unknown as Json,
      tokens_total: Math.round(input.tokensTotal),
      occurred_on: days[0] ?? localDay(Date.parse(input.startedAt), offset),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (error) throw new Error(`work_sessions upsert failed: ${error.message}`);
  return days;
}

type SessionRow = {
  repo_id: string;
  company_id: string;
  active_intervals: Json;
  human_turns: Json;
  started_at: string | null;
};


/** Recompute the given local days for one person across every repo they have
 *  sessions on, writing one auto row per (repo, day). Days with no sessions
 *  are left as they are (the reconcile pass flags those). */
export async function recomputePersonDays(personId: string, days: string[]): Promise<number> {
  if (days.length === 0) return 0;
  const profile = await loadProfile(personId);
  const sorted = [...days].sort();
  // A generous UTC window around the local days; the rule cuts exactly.
  const fromIso = new Date(Date.parse(`${sorted[0]}T00:00:00Z`) - 2 * 86_400_000).toISOString();
  const toIso = new Date(Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`) + 3 * 86_400_000).toISOString();
  const { data: sessionRows, error } = await selectAll<SessionRow>((from, to) =>
    htt
      .from("work_sessions")
      .select("repo_id, company_id, active_intervals, human_turns, started_at", { count: "exact" })
      .eq("person_id", personId)
      .gte("started_at", fromIso)
      .lte("started_at", toIso)
      .order("started_at")
      .range(from, to),
  );
  if (error) throw new Error(`work_sessions read failed: ${error.message}`);

  const sessions: RepoSessions[] = [];
  const companyByRepo = new Map<string, string>();
  // Session counts per (day, repo) for the evidence column.
  const sessionCount = new Map<string, number>();
  for (const r of sessionRows) {
    const turns = parseTurns(r.human_turns);
    // With turns on record the clock is derived from them (one source of truth);
    // a pre-1.4.0 session keeps the stored all-lines runs and has nothing unattended.
    const intervals = turns.length > 0 ? humanRunIntervals(turns) : parseIntervals(r.active_intervals);
    const unattended = turns.length > 0 ? unattendedIntervals(turns) : [];
    sessions.push({ repoId: r.repo_id, intervals, turns, unattended });
    companyByRepo.set(r.repo_id, r.company_id);
    for (const day of daysTouched(intervals, profile.offsetMinutes)) {
      const key = `${day}|${r.repo_id}`;
      sessionCount.set(key, (sessionCount.get(key) ?? 0) + 1);
    }
  }

  const wanted = new Set(sorted);
  const rows = computeDayHoursV2(sessions, profile.offsetMinutes, profile.budget).filter((r) => wanted.has(r.day));
  // PRs a day's turns belong to: head_branch on the same repo, open (or not yet
  // closed) on that day. Named in evidence so the ledger can verify hours
  // against the PR they produced; a branch with no PR stays repo-scoped.
  const prsByRepoBranch = await loadPrsForBranches(rows);
  let written = 0;
  for (const row of rows) {
    const companyId = companyByRepo.get(row.repoId);
    if (!companyId) continue;
    const { data: existing, error: exErr } = await htt
      .from("man_hour_entries")
      .select("id")
      .eq("source", "auto_session")
      .eq("person_id", personId)
      .eq("repo_id", row.repoId)
      .eq("occurred_on", row.day);
    if (exErr) throw new Error(`man_hour_entries read failed: ${exErr.message}`);
    const { data: manual, error: manErr } = await htt
      .from("man_hour_entries")
      .select("id")
      .eq("source", "manual")
      .eq("person_id", personId)
      .eq("repo_id", row.repoId)
      .eq("occurred_on", row.day)
      .neq("status", "excluded")
      .limit(1);
    if (manErr) throw new Error(`man_hour_entries read failed: ${manErr.message}`);
    const overridden = (manual ?? []).length > 0;
    const prs: Record<string, number> = {};
    for (const [branch, n] of Object.entries(row.branches)) {
      for (const pr of prsByRepoBranch.get(`${row.repoId}|${branch}`) ?? []) {
        if (pr.opened_at && pr.opened_at.slice(0, 10) > row.day && !pr.merged_at && !pr.closed_at) continue; // opened after this day and never closed: still plausible — keep
        const closed = pr.merged_at ?? pr.closed_at;
        if (closed && closed.slice(0, 10) < row.day) continue; // PR was done before this day
        prs[String(pr.number)] = (prs[String(pr.number)] ?? 0) + n;
      }
    }
    const evidence: Json = {
      rule: "v2",
      gapMinutes: HUMAN_GAP_MS / 60_000,
      sessions: sessionCount.get(`${row.day}|${row.repoId}`) ?? 0,
      // What the ledger's "day Xh across projects" line means: the hours actually
      // billed that day, this repo plus the others. It used to be dayTotal, which
      // the per-repo ceiling and the MIN_DAY_HOURS floor can both pull away from,
      // so the note stopped equalling the columns beside it. The pre-cap figure
      // lives in rawDayTotal, where the capped note reads it.
      totalMeasured: Math.round((row.final + Object.values(row.others).reduce((a, b) => a + b, 0)) * 100) / 100,
      dayTotal: row.dayTotal,
      fullHours: row.fullHours,
      unattendedHours: row.unattendedHours,
      unattendedWeight: UNATTENDED_WEIGHT, // the near-run rate; the bands carry the taper
      unattendedCredited: row.unattendedCredited,
      unattendedBands: row.unattendedBands,
      attendedByActivityHours: row.attendedByActivityHours,
      dayTurns: row.dayTurns,
      reviewReason: bridgeNeedsReview(row) ? "bridge" : null,
      ceiling: row.ceiling,
      rawDayTotal: row.rawDayTotal,
      capped: row.capped,
      share: row.share,
      turns: row.turns,
      branches: row.branches,
      prs,
      others: row.others,
      budget: profile.budget, // the daily cap the rule enforced
      tzOffsetMinutes: profile.offsetMinutes,
      scaled: row.capped,
    };
    const patch = {
      hours: row.final,
      measured_hours: row.measured,
      evidence,
      // The bridge review flag: a day that leaned on the presence bridge harder
      // than its typed lines can vouch for is shown to a human, never trimmed.
      needs_review: bridgeNeedsReview(row),
      status: overridden ? "excluded" : "recorded",
      updated_at: new Date().toISOString(),
    };
    const ids = (existing ?? []).map((r) => r.id as string);
    if (ids.length > 0) {
      const { error: upErr } = await htt.from("man_hour_entries").update(patch).in("id", ids);
      if (upErr) throw new Error(`man_hour_entries update failed: ${upErr.message}`);
    } else {
      const { error: insErr } = await htt.from("man_hour_entries").insert({
        ...patch,
        person_id: personId,
        company_id: companyId,
        repo_id: row.repoId,
        occurred_on: row.day,
        occurred_hour: 0,
        source: "auto_session",
        created_by: "hours-rule",
      });
      if (insErr) throw new Error(`man_hour_entries insert failed: ${insErr.message}`);
    }
    written++;
  }
  return written;
}

/** Re-run the rule over every day a person already has stored sessions for.
 *
 *  A ledger row keeps whatever weights were in force the moment it was written,
 *  and the only thing that rewrites one is the live ingest posting a session for
 *  that same day. So a rule change — the unattended taper, the daily cap — reaches
 *  history only if something walks it. This is that something: same rule, same
 *  writer, no second implementation.
 *
 *  Days are recomputed a month at a time because recomputePersonDays reads every
 *  session in a window spanning the days it is given; handing it two years at
 *  once would pull the person's whole history into memory for one pass.
 *  Returns the number of (repo, day) rows written. */
export async function rescanPersonHours(personId: string, sinceDay?: string): Promise<number> {
  const { data: rows, error } = await selectAll<{ occurred_on: string | null }>((from, to) => {
    let qb = htt
      .from("work_sessions")
      .select("occurred_on", { count: "exact" })
      .eq("person_id", personId);
    if (sinceDay) qb = qb.gte("occurred_on", sinceDay);
    return qb.order("occurred_on").order("id").range(from, to);
  });
  if (error) throw new Error(`work_sessions read failed: ${error.message}`);
  const days = [...new Set(rows.map((r) => r.occurred_on).filter((d): d is string => !!d))].sort();
  let written = 0;
  const CHUNK = 31;
  for (let i = 0; i < days.length; i += CHUNK) {
    written += await recomputePersonDays(personId, days.slice(i, i + CHUNK));
  }
  return written;
}

/** Every person with stored sessions, rescanned. Returns rows written. */
export async function rescanAllHours(sinceDay?: string): Promise<number> {
  const { data: rows, error } = await selectAll<{ person_id: string | null }>((from, to) => {
    let qb = htt.from("work_sessions").select("person_id", { count: "exact" });
    if (sinceDay) qb = qb.gte("occurred_on", sinceDay);
    return qb.order("person_id").order("id").range(from, to);
  });
  if (error) throw new Error(`work_sessions read failed: ${error.message}`);
  const people = [...new Set(rows.map((r) => r.person_id).filter((p): p is string => !!p))];
  let written = 0;
  for (const personId of people) written += await rescanPersonHours(personId, sinceDay);
  return written;
}

/** Auto rows that predate the rule (no measured figure) cannot be trusted:
 *  flag them for a human (no cap: see the note inside). Returns the number of
 *  rows flagged. */
export async function flagUnmeasuredDays(): Promise<number> {
  const { data: rows, error } = await selectAll<{ id: string; person_id: string | null; hours: number }>((from, to) =>
    htt
      .from("man_hour_entries")
      .select("id, person_id, hours", { count: "exact" })
      .eq("source", "auto_session")
      .is("measured_hours", null)
      .eq("needs_review", false)
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`man_hour_entries read failed: ${error.message}`);
  const budgets = new Map<string, number>();
  let flagged = 0;
  for (const r of rows) {
    let budget = DEFAULT_FOCUS_HOURS;
    if (r.person_id) {
      if (!budgets.has(r.person_id)) budgets.set(r.person_id, (await loadProfile(r.person_id)).budget);
      budget = budgets.get(r.person_id) ?? DEFAULT_FOCUS_HOURS;
    }
    const stored = Number(r.hours);
    const { error: upErr } = await htt
      .from("man_hour_entries")
      .update({
        // Flag only. The stored figure is the recorder's own (commit-span / all-lines)
        // number: unverified, but capping it to a budget would replace one guess
        // with another. A human reviews it, or a re-scan measures it (rule v2).
        needs_review: true,
        evidence: { rule: "legacy", storedHours: stored, budget, capped: false } as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (upErr) throw new Error(`man_hour_entries update failed: ${upErr.message}`);
    flagged++;
  }
  return flagged;
}
