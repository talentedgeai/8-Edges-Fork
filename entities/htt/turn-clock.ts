// The turn clock: how a person's typed lines become billable stretches of time.
//
// Split out of day-hours.ts when the presence bridge pushed it past the 400-line
// cap. This file knows what a typed line is worth — the watching allowance, the
// unattended taper, the presence bridge — and nothing about days, repos or caps;
// day-hours.ts imports it one way and does the apportioning.
import { unionIntervals, type SessionInterval, type WeightedInterval } from "./interval-math";

/** One line the contributor typed: when, on which git branch, and when the AI
 *  went quiet afterwards (`runEnd`, the last machine line before the next turn). */
export type HumanTurn = { t: string; branch: string | null; runEnd?: string | null };
// Rule v2 (decision 2026-09-07): the clock runs from a human turn until the
// EARLIEST of the next turn (if within HUMAN_GAP_MS), the AI going quiet
// (runEnd), or HUMAN_GAP_MS after the turn — the watching allowance. A watched
// 6-minute run bills 6; a 30-minute autonomous loop bills 10. One number
// governs both idle and watching.
export const HUMAN_GAP_MS = 10 * 60 * 1000;

// Unattended AI runtime (decision 2026-09-07, later the same day): the part of a
// run beyond the watching allowance is still the person's machine, budget and
// intent at work, so it is credited at a fraction of a human hour.
//
// Watched or not is decided by the reply: a human turn within HUMAN_GAP_MS of
// the AI going quiet means the person was there when it finished, so the last
// HUMAN_GAP_MS of the run and the reading gap up to the reply bill at full rate
// too. The middle of a long run is unattended either way — a prompt-and-reply
// pair cannot prove presence across an 11-hour autonomous loop (seen in the
// data: 689-minute runs that would otherwise bill 24-hour days). A run shorter
// than 2 × HUMAN_GAP_MS that was replied to therefore bills in full.
//
// TAPER (decision 2026-09-07, third revision — Khoa, on seeing 13.61 h of
// unattended runtime credited flat at 50% on a single day): the fraction is not
// constant. The longer a run goes without a human touching it, the weaker the
// claim that the person's judgement is still in it. The first stretch past the
// watching allowance is plausibly a run they are coming back to; hour eight of
// an autonomous loop is not. The weight is MARGINAL, not a cliff: each minute
// carries the weight for its own depth, so nobody loses money by a run
// finishing one minute later.
//
// v2.3 (decision 2026-09-08, Khoa): the three steps of v2.2 (50% to 3 h, 33% to
// 8 h, 15% after) become one curve. The step edges were places to argue, not
// facts about attention, and 15% was too generous for a run into its second
// day. The curve holds the near-run weight for the first hour, then loses a
// fixed number of points each time the run's depth doubles, until it reaches
// the floor at twelve hours and stays there. Three anchors, no fourth knob:
// where the hold ends, the floor, and where the floor is reached.
//
// Depth is measured from the human turn that started the run, so the hold
// includes the full-rate watching allowance.
export const UNATTENDED_WEIGHT = 0.5;
export const UNATTENDED_HOLD_MS = 60 * 60 * 1000;
export const UNATTENDED_FLOOR = 0.07;
export const UNATTENDED_FLOOR_AT_MS = 12 * 60 * 60 * 1000;
// The day rule works in bands of one weight each, so the continuous curve is
// quantised by depth: each slice this long carries the curve's weight at its
// midpoint. Fifteen minutes gives 44 slices between the hold and the floor,
// well inside a rounding error of the exact integral.
const UNATTENDED_SLICE_MS = 15 * 60 * 1000;

/** The unattended weight of one instant, by its depth into the run. */
export function unattendedWeightAt(depthMs: number): number {
  if (depthMs <= UNATTENDED_HOLD_MS) return UNATTENDED_WEIGHT;
  const perDoubling = (UNATTENDED_WEIGHT - UNATTENDED_FLOOR) / Math.log2(UNATTENDED_FLOOR_AT_MS / UNATTENDED_HOLD_MS);
  return Math.max(UNATTENDED_FLOOR, UNATTENDED_WEIGHT - perDoubling * Math.log2(depthMs / UNATTENDED_HOLD_MS));
}

type UnattendedTier = {
  /** Depth into the run, in ms, at which this tier ends; null = to the end. */
  untilMs: number | null;
  weight: number;
};
function buildTiers(): UnattendedTier[] {
  const tiers: UnattendedTier[] = [{ untilMs: UNATTENDED_HOLD_MS, weight: UNATTENDED_WEIGHT }];
  for (let from = UNATTENDED_HOLD_MS; from < UNATTENDED_FLOOR_AT_MS; from += UNATTENDED_SLICE_MS) {
    const to = Math.min(from + UNATTENDED_SLICE_MS, UNATTENDED_FLOOR_AT_MS);
    tiers.push({ untilMs: to, weight: Math.round(unattendedWeightAt((from + to) / 2) * 1000) / 1000 });
  }
  // Past the floor a run is an overnight batch. The tokens are on subscription
  // and the intent was real, so it is not zero, but very little else.
  tiers.push({ untilMs: null, weight: UNATTENDED_FLOOR });
  return tiers;
}
const UNATTENDED_TIERS: readonly UnattendedTier[] = buildTiers();

// THE PRESENCE BRIDGE (decision 2026-09-07, Khoa, fourth revision): a job left
// running while the person is demonstrably at their desk is not unattended. The
// proof of presence is typed lines — in ANY window, on ANY repo. Two consecutive
// typed lines no more than PRESENCE_GAP_MS apart mean the person was there for
// the whole gap, so machine time that falls inside such a gap bills at full rate
// instead of on the taper. A four-hour job in the middle of a working day, with
// the person typing elsewhere at least hourly, therefore bills in full (under
// the daily cap); an overnight loop with nothing typed around it bridges nothing
// and takes the sliding scale.
//
// The bridge only ever UPGRADES machine time. Idle minutes inside a gap with no
// job running stay unbilled — it cannot turn lunch into hours.
export const PRESENCE_GAP_MS = 60 * 60 * 1000;

/** Stretches during which the person was provably at their desk: the spans
 *  between consecutive typed lines (across every session) that are no more
 *  than gapMs apart. */
export function presenceIntervals(turns: HumanTurn[], gapMs = PRESENCE_GAP_MS): Array<[number, number]> {
  const ts = turns.map((h) => Date.parse(h.t)).filter(Number.isFinite).sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ts.length; i++) if (ts[i + 1] - ts[i] <= gapMs) out.push([ts[i], ts[i + 1]]);
  return unionIntervals(out);
}

type TurnPoint = { t: number; end: number; next: number | null };

function turnPoints(turns: HumanTurn[]): TurnPoint[] {
  const ts = turns
    .map((h) => ({ t: Date.parse(h.t), end: h.runEnd ? Date.parse(h.runEnd) : NaN }))
    .filter((h) => Number.isFinite(h.t))
    .sort((a, b) => a.t - b.t);
  return ts.map((h, i) => ({
    t: h.t,
    end: Math.max(h.t, Number.isFinite(h.end) ? h.end : h.t),
    next: i + 1 < ts.length ? ts[i + 1].t : null,
  }));
}

/** Was the person there when this run finished? A reply within gapMs of runEnd. */
function attended(p: TurnPoint, gapMs: number): boolean {
  return p.next != null && p.next - p.end <= gapMs;
}

/** Full-rate runs over human turns: consecutive turns within `gapMs` share a run;
 *  each turn contributes [t, min(runEnd, t + gapMs)], or the whole run [t, runEnd]
 *  when the person replied within gapMs of the AI going quiet (they were watching). */
export function humanRunIntervals(turns: HumanTurn[], gapMs = HUMAN_GAP_MS): SessionInterval[] {
  const pieces: Array<[number, number]> = [];
  const pts = turnPoints(turns);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    pieces.push([p.t, Math.max(p.t, Math.min(p.end, p.t + gapMs))]); // the watching allowance
    if (attended(p, gapMs)) {
      // Present when it finished: the run's last stretch and the reading gap up to the reply.
      pieces.push([Math.max(p.t, p.end - gapMs), p.next as number]);
    } else if (p.next != null && p.next - p.t <= gapMs) {
      pieces.push([p.t, p.next]); // chained turns
    }
  }
  return unionIntervals(pieces).map(([s, e]) => ({ start: new Date(s).toISOString(), end: new Date(e).toISOString() }));
}

/** Unattended stretches: the part of a run beyond the watching allowance,
 *  [t + gapMs, runEnd], minus the last gapMs when the person replied promptly
 *  (they were back for the finish), cut at the UNATTENDED_TIERS boundaries so
 *  each piece carries the weight for its depth into the run. Credited by the
 *  day rule, net of any full-rate time it overlaps.
 *
 *  Pieces are NOT unioned here: two pieces at different weights cannot merge,
 *  and overlap between sessions is resolved by the day rule (highest weight
 *  wins, so a second is never billed twice). */
export function unattendedIntervals(turns: HumanTurn[], gapMs = HUMAN_GAP_MS): WeightedInterval[] {
  const out: WeightedInterval[] = [];
  for (const p of turnPoints(turns)) {
    const from = p.t + gapMs;
    const to = attended(p, gapMs) ? p.end - gapMs : p.end;
    if (to <= from) continue;
    let cur = from;
    for (const tier of UNATTENDED_TIERS) {
      const edge = tier.untilMs == null ? to : Math.min(to, p.t + tier.untilMs);
      if (edge > cur) {
        out.push({ start: new Date(cur).toISOString(), end: new Date(edge).toISOString(), weight: tier.weight });
        cur = edge;
      }
      if (cur >= to) break;
    }
    // A tier list that does not end in an open tier would leave a tail uncredited.
    if (cur < to) {
      out.push({ start: new Date(cur).toISOString(), end: new Date(to).toISOString(), weight: UNATTENDED_TIERS[UNATTENDED_TIERS.length - 1].weight });
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || b.weight - a.weight);
}
