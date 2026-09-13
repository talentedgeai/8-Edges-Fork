import { addDays } from "@/kernel/config/dates";

// The 1-1 rhythm assumes itself: once a profile has any 1-1 date, the next one
// is that date plus the cadence, and the daily cycle keeps stepping it forward
// until the coach pauses the profile. Nobody has to book the next one by hand.
// Anchoring on the last known date (scheduled or held) keeps the weekday, so a
// biweekly Wednesday stays a Wednesday. Returns null when there is nothing to
// anchor on: a profile that has never had a 1-1 waits for its first date.
export function rollForward(
  next: string | null,
  lastHeld: string | null,
  cadenceDays: number,
  todayISO: string,
): string | null {
  const step = cadenceDays > 0 ? cadenceDays : 14;
  let base = next && (!lastHeld || next >= lastHeld) ? next : lastHeld;
  if (!base) return null;
  while (base < todayISO) base = addDays(base, step);
  return base;
}
