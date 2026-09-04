// Calendar-date helpers on YYYY-MM-DD strings with Saigon-date semantics. The
// business runs on Asia/Ho_Chi_Minh, so "today" is the Saigon calendar date no
// matter where the server happens to run; arithmetic is done in UTC on the
// date-only string so DST and server timezone can never shift a day.

const DAY_MS = 86_400_000;

// Today's date in Saigon as YYYY-MM-DD (en-CA is the locale whose default
// format is exactly ISO date order).
export function saigonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

// Midnight UTC of a YYYY-MM-DD string, in ms.
export function dateMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

// `iso` plus `days` calendar days (negative allowed), as YYYY-MM-DD.
export function addDays(iso: string, days: number): string {
  return new Date(dateMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier).
export function diffDays(fromISO: string, toISO: string): number {
  return Math.round((dateMs(toISO) - dateMs(fromISO)) / DAY_MS);
}
