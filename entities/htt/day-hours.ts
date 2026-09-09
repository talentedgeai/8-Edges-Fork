// The human-hours rule (docs: /workflows/private/e8/human-hours-plan.html).
//
// A person's delivered hours on a repo for a day are NOT the wall-clock span of
// their commits or their transcripts. They are:
//   1. hands-on time: every Claude session is a list of active intervals (the
//      clock stops after ACTIVE_GAP_MS of silence); overlapping sessions on the
//      same repo count once;
//   2. in the person's own timezone: an interval that crosses local midnight is
//      split at the boundary;
//   3. under a daily focus budget: if the person's hands-on time across ALL
//      repos exceeds their budget, every repo's share is scaled down in
//      proportion so the day totals the budget;
//   4. floored: a repo that got real work but under MIN_DAY_HOURS rounds up to
//      MIN_DAY_HOURS, so a quick fix is still a line on the ledger.
// Pure functions only, so the rule is unit-tested and the same code serves the
// live ingest, the backfill script and any later re-run.

import {
  localDay,
  measuredHoursByDay,
  subtractIntervals,
  intersectIntervals,
  intervalsFromTimestamps as intervalsFromTimestampsAt,
  unionIntervals,
  type SessionInterval,
  type WeightedInterval,
} from "./interval-math";
import { presenceIntervals, type HumanTurn } from "./turn-clock";

export {
  // The rule's own callers (the ingest, the ledger, the tests) reach the
  // geometry through here, so day-hours.ts stays the single entry point to the
  // hours rule even though its arithmetic now lives next door.
  localDay,
  measuredHoursByDay,
  subtractIntervals,
  unionIntervals,
  tzOffsetMinutes,
  type SessionInterval,
  type WeightedInterval,
} from "./interval-math";
export {
  HUMAN_GAP_MS,
  PRESENCE_GAP_MS,
  UNATTENDED_WEIGHT,
  UNATTENDED_FLOOR,
  UNATTENDED_HOLD_MS,
  UNATTENDED_FLOOR_AT_MS,
  unattendedWeightAt,
  humanRunIntervals,
  presenceIntervals,
  unattendedIntervals,
  type HumanTurn,
} from "./turn-clock";

export const ACTIVE_GAP_MS = 30 * 60 * 1000;

// THE BRIDGE REVIEW FLAG (decision 2026-09-08, Khoa, after the v2.3 debate): the
// presence bridge is the one clause a person could lean on — one typed line
// every fifty-nine minutes through the night would bill the whole night in
// full, because two lines under an hour apart prove presence for the gap. No
// timing rule prices that away without also punishing the engineer who
// genuinely types once an hour while a long job runs. So the rule does what it
// does for the daily cap: it does not trim, it FLAGS. A day earns the flag when
// the bridge lifted more than BRIDGE_REVIEW_MIN_HOURS of machine time to full
// rate AND did so on very few typed lines — more than BRIDGE_REVIEW_HOURS_PER_LINE
// of bridged time per line typed anywhere that day. A four-hour job with the
// person typing every forty-five minutes elsewhere stays clear (under four
// hours bridged); an all-day job beside twenty typed lines stays clear (well
// under half an hour per line); the hourly overnight keystroke does not.
export const BRIDGE_REVIEW_MIN_HOURS = 4;
export const BRIDGE_REVIEW_HOURS_PER_LINE = 0.5;

/** True when a day leaned on the presence bridge harder than a few typed lines
 *  can vouch for. A signal for a human, never a deduction. */
export function bridgeNeedsReview(row: Pick<DayRepoHoursV2, "attendedByActivityHours" | "dayTurns">): boolean {
  if (row.attendedByActivityHours <= BRIDGE_REVIEW_MIN_HOURS) return false;
  return row.attendedByActivityHours > BRIDGE_REVIEW_HOURS_PER_LINE * Math.max(1, row.dayTurns);
}
export const DEFAULT_FOCUS_HOURS = 6;
export const MIN_DAY_HOURS = 0.25;

export type RepoSessions = { repoId: string; intervals: SessionInterval[]; turns?: HumanTurn[]; unattended?: WeightedInterval[] };

export type DayRepoHours = {
  day: string; // YYYY-MM-DD in the person's timezone
  repoId: string;
  measured: number; // hands-on hours on this repo, after the floor
  final: number; // after the budget split
  scaled: boolean; // true when the day's total exceeded the budget
  totalMeasured: number; // hands-on hours across every repo that day
  others: Record<string, number>; // the other repos' final hours that day
};

/** Active intervals from message instants, at the rule's idle gap. */
export function intervalsFromTimestamps(ts: number[], gapMs = ACTIVE_GAP_MS): SessionInterval[] {
  return intervalsFromTimestampsAt(ts, gapMs);
}

/** Floor each repo, then split the person's budget across repos in proportion
 *  when the day's total exceeds it. */
export function applyFocusBudget(
  byRepo: Map<string, number>,
  budget: number,
): Map<string, { measured: number; final: number; scaled: boolean; total: number }> {
  const floored = new Map<string, number>();
  for (const [repoId, h] of byRepo) {
    if (h <= 0) continue;
    floored.set(repoId, Math.max(h, MIN_DAY_HOURS));
  }
  const total = [...floored.values()].reduce((a, b) => a + b, 0);
  const scale = budget > 0 && total > budget ? budget / total : 1;
  const out = new Map<string, { measured: number; final: number; scaled: boolean; total: number }>();
  for (const [repoId, measured] of floored) {
    out.set(repoId, {
      measured: round2(measured),
      final: round2(measured * scale),
      scaled: scale < 1,
      total: round2(total),
    });
  }
  return out;
}

/** The whole rule: sessions in, one row per (day, repo) out. */
export function computeDayHours(
  sessions: RepoSessions[],
  offsetMinutes: number,
  budget: number = DEFAULT_FOCUS_HOURS,
): DayRepoHours[] {
  const rows: DayRepoHours[] = [];
  for (const [day, byRepo] of measuredHoursByDay(sessions, offsetMinutes)) {
    const split = applyFocusBudget(byRepo, budget);
    for (const [repoId, v] of split) {
      const others: Record<string, number> = {};
      for (const [other, ov] of split) if (other !== repoId) others[other] = ov.final;
      rows.push({ day, repoId, measured: v.measured, final: v.final, scaled: v.scaled, totalMeasured: v.total, others });
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.repoId.localeCompare(b.repoId));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


// ─── Rule v2: the human-turn clock ──────────────────────────────────────────
//
// 1. `intervals` are runs of HUMAN turns (10-minute gap) — the ingest builds them
//    from `human_turns`; a legacy session with no turns keeps its all-lines runs.
// 2. The day total is the UNION of every run across every session and repo, so
//    concurrent windows count once and a day can never exceed 24 hours.
// 3. The day is apportioned to repos by share of human turns (fallback: share of
//    per-repo unioned time when no session carries turns), floored per repo.
// 4. Per-repo turn counts are also kept per branch, so the ledger can name the
//    PR(s) a day's hours belong to. There is NO budget scaling of measured time.
export type DayRepoHoursV2 = {
  day: string;
  repoId: string;
  measured: number; // this repo's own unioned run time (reference)
  final: number; // its share of the day total, under its own ceiling, after the floor
  dayTotal: number; // what the day bills: rawDayTotal, or the budget when it was capped
  rawDayTotal: number; // full-rate union + the credited part of the unattended hours
  capped: boolean; // rawDayTotal exceeded the person's daily budget
  budget: number; // the person's daily cap, 0 when they have none
  fullHours: number; // union of full-rate runs across repos
  unattendedHours: number; // union of unwatched AI runtime, net of full-rate time
  unattendedCredited: number; // what that runtime adds to the day, after the taper
  unattendedBands: Array<{ weight: number; hours: number }>; // the taper, band by band, heaviest first
  attendedByActivityHours: number; // machine time upgraded to full rate because the person was typing elsewhere
  ceiling: number; // this repo's own clock: measured + bridged machine time + its share of the credit
  share: number; // 0..1
  turns: number; // human turns on this repo that day
  dayTurns: number; // human turns across every repo that day — what the presence bridge rests on
  branches: Record<string, number>; // branch -> human turns
  others: Record<string, number>; // other repos' final hours that day
};

export function computeDayHoursV2(
  sessions: RepoSessions[],
  offsetMinutes: number,
  /** The person's daily cap. 0 means uncapped; the ledger always passes a real one. */
  budget = 0,
): DayRepoHoursV2[] {
  const perRepo = measuredHoursByDay(sessions, offsetMinutes);
  const pooled = measuredHoursByDay(
    [{ repoId: "__all__", intervals: sessions.flatMap((s) => s.intervals) }],
    offsetMinutes,
  );
  // Unwatched AI runtime, net of any full-rate time it overlaps (a run left alone
  // in one window while the person typed in another is already billed in full).
  //
  // The taper means a second of wall clock can sit in two runs at two weights at
  // once. Bands are settled heaviest first and each band is netted against
  // everything already claimed, so every second is credited exactly once and at
  // the BEST weight it qualifies for: if any run was touched recently, the person
  // is more plausibly around, and running two agents should not cost them.
  const toMs = (iv: SessionInterval) => [Date.parse(iv.start), Date.parse(iv.end)] as [number, number];
  const finite = (p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= p[0];
  const toIso = ([s, e]: [number, number]) => ({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
  const keyboardMs = sessions.flatMap((s) => s.intervals).map(toMs).filter(finite);
  const unatt = sessions.flatMap((s) => s.unattended ?? []);
  // The presence bridge: machine time that overlaps a span between two typed
  // lines (any window) close enough to prove the person was there. It joins the
  // full-rate cover before the bands are netted, so it is never also credited
  // on the taper, and it is reported net of keyboard time so the ledger can say
  // how much it added.
  const presence = presenceIntervals(sessions.flatMap((s) => s.turns ?? []));
  const bridgedMs = intersectIntervals(unatt.map(toMs).filter(finite), presence);
  const fullMs = [...keyboardMs, ...bridgedMs];
  const bridgedNet = measuredHoursByDay(
    [{ repoId: "__all__", intervals: subtractIntervals(bridgedMs, keyboardMs).map(toIso) }],
    offsetMinutes,
  );
  // Per repo, for the ceiling: the bridged machine time of that repo's own jobs.
  const bridgedByRepo = measuredHoursByDay(
    sessions.map((s) => ({ repoId: s.repoId, intervals: intersectIntervals((s.unattended ?? []).map(toMs).filter(finite), presence).map(toIso) })),
    offsetMinutes,
  );
  const weights = [...new Set(unatt.map((iv) => iv.weight))].sort((a, b) => b - a);
  let claimed = unionIntervals(fullMs);
  const bands: Array<{ weight: number; byDay: Map<string, Map<string, number>> }> = [];
  // day -> repo -> credited unattended hours attributable to that repo. Each
  // band is netted against the SAME cover the pooled band used, so a repo can
  // never claim a second the day did not count. Two repos may both claim a
  // second they genuinely shared; that is fine, because this is only ever a
  // per-repo CEILING, never an allocation.
  const creditByRepo = new Map<string, Map<string, number>>();
  for (const weight of weights) {
    const cover = claimed; // snapshot: the pooled band and the per-repo bands must net against the same cover
    const at = (list: WeightedInterval[]) => subtractIntervals(list.filter((iv) => iv.weight === weight).map(toMs).filter(finite), cover);
    const net = at(unatt);
    bands.push({ weight, byDay: measuredHoursByDay([{ repoId: "__all__", intervals: net.map(toIso) }], offsetMinutes) });
    const perRepoBand = measuredHoursByDay(
      sessions.map((s) => ({ repoId: s.repoId, intervals: at(s.unattended ?? []).map(toIso) })),
      offsetMinutes,
    );
    for (const [day, byRepo] of perRepoBand) {
      const dayMap = creditByRepo.get(day) ?? new Map<string, number>();
      for (const [repoId, hours] of byRepo) dayMap.set(repoId, (dayMap.get(repoId) ?? 0) + weight * hours);
      creditByRepo.set(day, dayMap);
    }
    claimed = unionIntervals([...claimed, ...net]);
  }
  // day -> repo -> { turns, branches }
  const turnsBy = new Map<string, Map<string, { n: number; branches: Record<string, number> }>>();
  for (const s of sessions) {
    for (const turn of s.turns ?? []) {
      const ms = Date.parse(turn.t);
      if (!Number.isFinite(ms)) continue;
      const day = localDay(ms, offsetMinutes);
      const dayMap = turnsBy.get(day) ?? new Map();
      const slot = dayMap.get(s.repoId) ?? { n: 0, branches: {} };
      slot.n += 1;
      const b = turn.branch && turn.branch.length > 0 ? turn.branch : "(none)";
      slot.branches[b] = (slot.branches[b] ?? 0) + 1;
      dayMap.set(s.repoId, slot);
      turnsBy.set(day, dayMap);
    }
  }
  const days = new Set<string>([...perRepo.keys(), ...turnsBy.keys(), ...bands.flatMap((b) => [...b.byDay.keys()])]);
  const rows: DayRepoHoursV2[] = [];
  for (const day of days) {
    const measuredMap = perRepo.get(day) ?? new Map<string, number>();
    const turnMap = turnsBy.get(day) ?? new Map<string, { n: number; branches: Record<string, number> }>();
    const creditMap = creditByRepo.get(day) ?? new Map<string, number>();
    const bridgedMap = bridgedByRepo.get(day) ?? new Map<string, number>();
    const repoIds = new Set<string>([...measuredMap.keys(), ...turnMap.keys(), ...creditMap.keys(), ...bridgedMap.keys()]);
    const attendedByActivityHours = bridgedNet.get(day)?.get("__all__") ?? 0;
    const fullHours = (pooled.get(day)?.get("__all__") ?? 0) + attendedByActivityHours;
    const dayBands = bands
      .map((b) => ({ weight: b.weight, hours: b.byDay.get(day)?.get("__all__") ?? 0 }))
      .filter((b) => b.hours > 0);
    const unattendedHours = dayBands.reduce((a, b) => a + b.hours, 0);
    const unattendedCredited = dayBands.reduce((a, b) => a + b.weight * b.hours, 0);
    // What the rule measured, before the person's daily cap.
    const rawDayTotal = fullHours + unattendedCredited;
    // THE DAILY CAP (decision 2026-09-07, Khoa): "my daily cap is 12 hours, I
    // never work more than that; anything above it means duplicated effort."
    // The union arithmetic cannot double-count a second — full-rate time and
    // every unattended band are disjoint by construction — but it CAN cover
    // more wall clock than a person was ever awake for, because an autonomous
    // run at 03:00 is clock time nobody was living through. The budget is the
    // backstop: a day never bills more than the person says they work, and a
    // day that hits it is flagged rather than silently trimmed, because the
    // overflow is evidence that something upstream is measuring wrong.
    const capped = budget > 0 && rawDayTotal > budget;
    const dayTotal = capped ? budget : rawDayTotal;
    // THE SPLIT (decision 2026-09-07, Khoa, fifth revision): the day is shared
    // between repos by each repo's OWN CLOCK — the time typed there, plus the
    // machine time bridged to full rate there, plus the credited machine time
    // there — never by how many lines were typed. Line count starved the client
    // whose four-hour job ran while the person typed elsewhere: one line out of
    // a hundred gave that job a floor-sized share, which contradicts "a job left
    // running while you work elsewhere bills in full".
    //
    // Two clocks that overlap in wall time (client A's job running while the
    // person types for client B) share the overlapping hour in proportion. The
    // person's day is credited once — the union — and no client is billed an
    // hour that was really another client's. A repo's share of the day can
    // never exceed its own clock, because the day is at most the union and the
    // union is at most the sum of the clocks.
    const claims = new Map<string, number>();
    for (const repoId of repoIds) {
      const claim = (measuredMap.get(repoId) ?? 0) + (bridgedMap.get(repoId) ?? 0) + (creditMap.get(repoId) ?? 0);
      if (claim > 0 || (turnMap.get(repoId)?.n ?? 0) > 0) claims.set(repoId, claim);
    }
    const summedClaims = [...claims.values()].reduce((a, v) => a + v, 0);
    const turnsDay = [...turnMap.values()].reduce((a, v) => a + v.n, 0);
    const finals = new Map<string, DayRepoHoursV2>();
    for (const [repoId, claim] of claims) {
      const measured = measuredMap.get(repoId) ?? 0;
      const t = turnMap.get(repoId) ?? { n: 0, branches: {} };
      // A repo with turns but no clock at all (every line inside another repo's
      // window) falls back to its share of typed lines, so it still gets a row.
      const share = summedClaims > 0 ? claim / summedClaims : turnsDay > 0 ? t.n / turnsDay : 0;
      const ceiling = claim;
      const final = Math.max(MIN_DAY_HOURS, Math.min(dayTotal * share, ceiling));
      finals.set(repoId, {
        day, repoId,
        measured: round2(measured), final: round2(final),
        dayTotal: round2(dayTotal), rawDayTotal: round2(rawDayTotal), capped, budget,
        fullHours: round2(fullHours), unattendedHours: round2(unattendedHours),
        unattendedCredited: round2(unattendedCredited),
        unattendedBands: dayBands.map((b) => ({ weight: b.weight, hours: round2(b.hours) })),
        attendedByActivityHours: round2(attendedByActivityHours),
        ceiling: round2(ceiling),
        share: Math.round(share * 10_000) / 10_000, turns: t.n, dayTurns: turnsDay, branches: t.branches, others: {},
      });
    }
    for (const [repoId, row] of finals) {
      for (const [other, o] of finals) if (other !== repoId) row.others[other] = o.final;
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.repoId.localeCompare(b.repoId));
}
