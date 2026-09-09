// The ingest's clock choice, kept free of any database import so it can be
// unit-tested (and so the ingest route's pure logic lives in one place).
import { humanRunIntervals, unattendedIntervals, type HumanTurn, type SessionInterval, type WeightedInterval } from "./day-hours";
import type { TelemetryEntry } from "./session-ingest";

/**
 * The active intervals of a Claude session entry. A recorder that predates
 * active_intervals sends only active_minutes; those minutes are placed from
 * started_at, which bounds the day correctly even if it misplaces the hour.
 */
export function sessionIntervalsFor(e: TelemetryEntry): SessionInterval[] {
  // Rule v2: when the recorder sent human turns, the clock is theirs — from a
  // turn until the earliest of the next turn, the AI going quiet, or 10 minutes.
  // AI/tool output never extends a run beyond the watching allowance.
  const turns = humanTurnsFor(e);
  if (turns.length > 0) return humanRunIntervals(turns);
  const given = (e.active_intervals ?? []).filter(
    (iv) => typeof iv?.start === "string" && typeof iv?.end === "string" && Date.parse(iv.end) >= Date.parse(iv.start),
  );
  if (given.length > 0) return given.map((iv) => ({ start: iv.start, end: iv.end }));
  const start = Date.parse(e.started_at);
  if (!Number.isFinite(start)) return [];
  const minutes = Math.max(0, Number(e.active_minutes ?? 0));
  const endedAt = e.ended_at ? Date.parse(e.ended_at) : start;
  const end = Math.min(Number.isFinite(endedAt) ? endedAt : start, start + minutes * 60_000);
  return [{ start: new Date(start).toISOString(), end: new Date(Math.max(start, end)).toISOString() }];
}

/** Valid human turns of an entry, sorted; [] for a pre-1.4.0 recorder. */
export function humanTurnsFor(e: TelemetryEntry): HumanTurn[] {
  const out: HumanTurn[] = [];
  for (const h of e.human_turns ?? []) {
    if (!h || typeof h.t !== "string" || !Number.isFinite(Date.parse(h.t))) continue;
    out.push({
      t: h.t,
      branch: typeof h.branch === "string" && h.branch.length > 0 ? h.branch : null,
      runEnd: typeof h.run_end === "string" && Number.isFinite(Date.parse(h.run_end)) ? h.run_end : null,
    });
  }
  return out.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/** Unwatched AI runtime of an entry (see unattendedIntervals); [] for a legacy recorder. */
export function unattendedIntervalsFor(e: TelemetryEntry): WeightedInterval[] {
  const turns = humanTurnsFor(e);
  return turns.length > 0 ? unattendedIntervals(turns) : [];
}
