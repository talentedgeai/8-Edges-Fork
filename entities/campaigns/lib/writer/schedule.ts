// The two decisions the hourly writer-schedule routine makes, kept pure so
// they can be tested without a database: whether a campaign's start date is
// close enough to draft for, and whether a run has sat on a step long enough
// to count as a dropped hand-off.

// A campaign is drafted the day before it starts, or on the day itself if the
// day before was missed. Earlier than that the idea may still be changing;
// later than that the date has passed and a person should decide.
export function startsWithinWindow(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  const start = new Date(`${startsOn}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const days = Math.round((start - now) / 86_400_000);
  return days === 0 || days === 1;
}

// A step is one model call; the longest (an edit pass) takes about four
// minutes. A run with no step recorded for longer than this has lost its
// hand-off, since a live step would have written its run row by now.
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function isStale(lastActivityIso: string | null, nowMs: number): boolean {
  if (!lastActivityIso) return true;
  return nowMs - new Date(lastActivityIso).getTime() > STALE_AFTER_MS;
}
