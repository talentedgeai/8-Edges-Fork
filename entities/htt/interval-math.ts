// The geometry and calendar layer under the human-hours rule: intervals on a
// timeline, and the person's local day those intervals fall on. Split out of
// day-hours.ts when the unattended taper pushed that file past the 400-line cap.
//
// Nothing here knows what an hour is worth. Billing decisions — the watching
// allowance, the unattended weights, the apportionment across repos — all live
// in day-hours.ts, which imports this one way. Keeping the split in that
// direction is what lets the rule change without the arithmetic moving.

export type SessionInterval = { start: string; end: string }; // ISO instants
/** An unattended stretch and the fraction of a human hour it is credited at. */
export type WeightedInterval = SessionInterval & { weight: number };

// Edge8 is a Vietnam company; a person with no timezone on their profile is
// assumed to work there rather than in UTC, which is what produced the 24-hour
// days the hours rule replaces.
export const DEFAULT_TZ_OFFSET_MINUTES = 7 * 60;

/** Active intervals from a sorted-or-not list of message instants: the clock
 *  runs while consecutive messages are within gapMs of each other. */
export function intervalsFromTimestamps(ts: number[], gapMs: number): SessionInterval[] {
  const sorted = [...ts].sort((a, b) => a - b);
  const out: SessionInterval[] = [];
  if (sorted.length === 0) return out;
  let start = sorted[0];
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t - last <= gapMs) last = t;
    else {
      out.push({ start: new Date(start).toISOString(), end: new Date(last).toISOString() });
      start = last = t;
    }
  }
  out.push({ start: new Date(start).toISOString(), end: new Date(last).toISOString() });
  return out;
}

/** Merge overlapping or touching intervals. */
export function unionIntervals(iv: Array<[number, number]>): Array<[number, number]> {
  const sorted = iv.filter(([s, e]) => e >= s).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The part of `a` that lies inside `b` (both as [ms, ms] lists, any order). */
export function intersectIntervals(a: Array<[number, number]>, b: Array<[number, number]>): Array<[number, number]> {
  // a ∩ b = a − (a − b): one subtraction to find what b misses, one to remove it.
  return subtractIntervals(a, subtractIntervals(a, b));
}

/** Hours of `a` not covered by `b` (both as [ms, ms] lists, any order). */
export function subtractIntervals(a: Array<[number, number]>, b: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const cover = unionIntervals(b);
  for (const [s, e] of unionIntervals(a)) {
    let cur = s;
    for (const [cs, ce] of cover) {
      if (ce <= cur) continue;
      if (cs >= e) break;
      if (cs > cur) out.push([cur, cs]);
      cur = Math.max(cur, ce);
      if (cur >= e) break;
    }
    if (cur < e) out.push([cur, e]);
  }
  return out;
}

/** The fixed UTC offset, in minutes, that a person's profile timezone means.
 *  Accepts an IANA name ("Asia/Ho_Chi_Minh"), a "+07:00" style offset, or the
 *  free text the profile form stores ("UTC+07:00 (Thailand, Vietnam)"); falls
 *  back to DEFAULT_TZ_OFFSET_MINUTES. `at` resolves DST for IANA zones. */
export function tzOffsetMinutes(tz: string | null | undefined, at: Date = new Date()): number {
  if (!tz) return DEFAULT_TZ_OFFSET_MINUTES;
  const m = /([+-])(\d{1,2}):?(\d{2})?/.exec(tz);
  if (m && !tz.includes("/")) {
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    // The parts carry no seconds, so compare against the instant floored to the minute.
    const atMinute = Math.floor(at.getTime() / 60_000) * 60_000;
    return Math.round((asUtc - atMinute) / 60_000);
  } catch {
    return DEFAULT_TZ_OFFSET_MINUTES;
  }
}

const DAY_MS = 86_400_000;

/** The local calendar day (YYYY-MM-DD) of an instant at a fixed offset. */
export function localDay(msUtc: number, offsetMinutes: number): string {
  return new Date(msUtc + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** UTC instant of the next local midnight strictly after msUtc. */
function nextLocalMidnight(msUtc: number, offsetMinutes: number): number {
  const shifted = msUtc + offsetMinutes * 60_000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStart + DAY_MS - offsetMinutes * 60_000;
}

/** Hours per local day per repo, overlaps merged within a repo and intervals
 *  split at local midnight. Takes any shape carrying a repo id and intervals,
 *  so the rule can run it over full-rate runs and over one weight's unattended
 *  band alike. */
export function measuredHoursByDay(
  sessions: Array<{ repoId: string; intervals: SessionInterval[] }>,
  offsetMinutes: number,
): Map<string, Map<string, number>> {
  const byRepo = new Map<string, Array<[number, number]>>();
  for (const s of sessions) {
    const list = byRepo.get(s.repoId) ?? [];
    for (const iv of s.intervals) {
      const a = Date.parse(iv.start);
      const b = Date.parse(iv.end);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) list.push([a, b]);
    }
    byRepo.set(s.repoId, list);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [repoId, list] of byRepo) {
    for (const [s, e] of unionIntervals(list)) {
      let cur = s;
      while (cur < e) {
        const next = Math.min(e, nextLocalMidnight(cur, offsetMinutes));
        const day = localDay(cur, offsetMinutes);
        const hours = (next - cur) / 3_600_000;
        const dayMap = out.get(day) ?? new Map<string, number>();
        dayMap.set(repoId, (dayMap.get(repoId) ?? 0) + hours);
        out.set(day, dayMap);
        cur = next;
      }
    }
  }
  return out;
}
