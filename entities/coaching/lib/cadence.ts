import { addDays, dateMs } from "@/kernel/config/dates";
import type { Result } from "@/kernel/data/result";

// Nobody holds a 1-1 at the weekend, so a rolled date that lands on one moves
// to the following Monday: Saturday +2, Sunday +1. Date-only strings are
// parsed at midnight UTC, so the weekday is the calendar weekday of the string
// itself, free of any server timezone.
function toWeekday(iso: string): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  if (day === 6) return addDays(iso, 2);
  if (day === 0) return addDays(iso, 1);
  return iso;
}

// The 1-1 rhythm assumes itself: once a profile has any 1-1 date, the next one
// is that date plus the cadence, and the daily cycle keeps stepping it forward
// until the coach pauses the profile. Nobody has to book the next one by hand.
// Anchoring on the last known date (scheduled or held) keeps the weekday, so a
// biweekly Wednesday stays a Wednesday. Returns null when there is nothing to
// anchor on: a profile that has never had a 1-1 waits for its first date.
//
// A preferred weekday (K.34, 0 Sunday to 6 Saturday) pins a rolled date to that
// weekday: the nearest occurrence to the cadence date, and never earlier than
// today. Only a date this roll produced is moved; a future
// date the coach or the member picked is theirs and stays where they put it.
export function rollForward(
  next: string | null,
  lastHeld: string | null,
  cadenceDays: number,
  todayISO: string,
  preferredWeekday: number | null = null,
): string | null {
  const step = cadenceDays > 0 ? cadenceDays : 14;
  let base = next && (!lastHeld || next >= lastHeld) ? next : lastHeld;
  if (!base) return null;
  // Bounded: a corrupt anchor (a date from 1970, or a clock that jumps) would
  // otherwise spin here forever inside a cron request. 400 steps of the
  // shortest sane cadence still covers years, so the bound can only be reached
  // by data that is already wrong — and then the last value computed is
  // returned, so the caller writes a date rather than hanging.
  for (let i = 0; i < 400 && base < todayISO; i += 1) base = addDays(base, step);
  // Only a date this roll produced is weekend-nudged; a future date the coach
  // picked is theirs and is left exactly where they put it.
  if (base === next) return base;
  if (preferredWeekday === null) return toWeekday(base);
  const pinned = nearestWeekday(base, preferredWeekday);
  return pinned < todayISO ? addDays(pinned, 7) : pinned;
}

// The occurrence of `weekday` nearest to `iso`: at most three days either way.
// Seven is odd, so there is never a tie: from a Wednesday, Sunday is three days
// back rather than four ahead.
export function nearestWeekday(iso: string, weekday: number): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  let delta = ((weekday - day) % 7 + 7) % 7;
  if (delta > 3) delta -= 7;
  return addDays(iso, delta);
}

// The first date on or after `iso` that falls on `weekday`: where a first 1-1
// lands when the member has said which day suits them (K.34).
export function nextWeekdayOnOrAfter(iso: string, weekday: number): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  return addDays(iso, ((weekday - day) % 7 + 7) % 7);
}

// A weekday number as English, read from the number alone so the server's
// locale never gets a say.
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// A month number as its short English name, read from the number alone for the
// same reason the weekdays are. Exported since K.56 because the practice
// sparkline labels months too, and a second copy of this array is how the two
// would come to disagree about how to spell September.
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// "Wednesday 23 Sep" — how both sides name a proposed day (K.32). Read from
// the date string alone, like every other date helper here, so the server's
// locale and timezone never get a say.
export function describeDay(iso: string): string {
  const d = new Date(dateMs(iso));
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

// "15:00" from a Postgres time value ("15:00:00"); null stays null.
export function shortTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = /^(\d{2}):(\d{2})/.exec(time);
  return m ? `${m[1]}:${m[2]}` : null;
}

// A date a 1-1 may be put on: a real YYYY-MM-DD, not in the past, and on a
// weekday. It lives here rather than beside the proposal that first needed it
// (K.32) because the move (K.33) applies exactly the same rule, and a second
// copy is how the two would drift. The weekend rule matches the roll-forward's
// above, which nudges a rolled date off Saturday and Sunday — accepting a
// Saturday here would let the two disagree.
export function validateProposedDate(dateISO: string, todayISO: string): Result {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { ok: false, error: "Pick a day first." };
  if (Number.isNaN(dateMs(dateISO))) return { ok: false, error: "Pick a day first." };
  if (dateISO < todayISO) return { ok: false, error: "Pick a day that has not passed." };
  const day = new Date(dateMs(dateISO)).getUTCDay();
  if (day === 0 || day === 6) return { ok: false, error: "1-1s run Monday to Friday. Pick a weekday." };
  return { ok: true };
}
