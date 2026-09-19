// Where a client stands against its start and end dates. Dates are calendar
// days ("2026-09-16"), compared as strings against today in the company time
// zone (GMT+7), so a relationship ending today still reads as active today.

// The term rule itself lives in the kernel, because the client lists in other
// entities decide "current" and "former" by it too.
import { clientTerm, type ClientTerm } from "@/kernel/identity/client-status";
export { clientTerm, type ClientTerm };

export function todayInCompanyZone(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function clientTermLabel(term: ClientTerm): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (term.state) {
    case "unset":
      return "No dates set";
    case "upcoming":
      return `Starts in ${plural(term.daysUntilStart, "day")}`;
    case "active":
      return term.daysLeft === null ? "Active, no end date" : `Active, ${plural(term.daysLeft, "day")} left`;
    case "ended":
      return `Ended ${plural(term.daysSinceEnd, "day")} ago`;
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A typed date to "YYYY-MM-DD": "" for a cleared field, null when it cannot be
// read. Numeric dates are day first (16/9/2026), the way the team writes them;
// ISO dates and month names ("16 Sep 2026", "Sep 16, 2026") also work.
export function parseTypedDate(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/,/g, " ");
  if (!text) return "";
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/))) {
    [d, m, y] = [Number(match[1]), MONTHS.indexOf(match[2]) + 1, Number(match[3])];
  } else if ((match = text.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})\s+(\d{4})$/))) {
    [m, d, y] = [MONTHS.indexOf(match[1]) + 1, Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}
