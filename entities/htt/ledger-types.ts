// Browser-safe types shared by the ledger data (hours-ledger.ts) and the
// HoursLedger client component; nothing here touches a server client.
export type LedgerRow = {
  day: string;
  personId: string | null;
  personName: string;
  measured: number | null; // null on legacy or hand-entered days
  autoHours: number | null; // what the rule would bill, before any override
  final: number; // what the client is billed
  overridden: boolean;
  reason: string | null; // the override's reason
  overrideBy: string | null;
  needsReview: boolean;
  scaled: boolean;
  sessions: number;
  totalMeasured: number | null;
  others: Array<{ repo: string; hours: number }>; // other repos that day, by name
  budget: number | null;
  rule: string | null; // "v2" human-turn clock, "v1" all-lines clock, "legacy" recorder figure
  legacyCapped: boolean; // a legacy row whose hours were cut to the budget by the old flagging pass
  turns: number | null; // human turns on this repo that day (v2)
  prs: string[]; // PR numbers the day's turns belong to (v2)
  unattendedHours: number | null; // unwatched AI runtime that day, before the taper (v2)
  unattendedWeight: number | null; // the near-run rate
  unattendedCredited: number | null; // hours that runtime actually added, after the taper
  unattendedBands: Array<{ weight: number; hours: number }>; // the taper band by band, heaviest first
  attendedByActivityHours: number | null; // machine time billed in full because the person was typing elsewhere
  dayTurns: number | null; // typed lines across every repo that day (v2.3)
  reviewReason: string | null; // why needsReview is set: "bridge" when the presence bridge outran the typed lines
  ceiling: number | null; // the most this repo's own clock could justify that day
  rawDayTotal: number | null; // what the rule measured before the daily cap
  capped: boolean; // the day hit the person's daily cap — a duplicated-effort signal
};
