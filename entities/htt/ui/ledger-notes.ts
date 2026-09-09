// How a ledger row explains itself in the Note column. Browser-safe and pure, so
// the table component stays about the table; split out when the daily cap's note
// pushed HoursLedger.tsx past the 250-line cap.
import type { LedgerRow } from "../ledger-types";

export function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// The unattended clause of a v2 note. It leads with what the runtime ACTUALLY
// added to the bill, not the raw runtime, because the raw figure read as the
// charge and the taper was invisible: "13.61h unattended AI at 50%" is what
// made a 15.87h day look like a lie. Bands are named only when the taper bit.
export function unattendedNote(r: LedgerRow): string {
  const bridged = r.attendedByActivityHours ? ` · +${fmt(r.attendedByActivityHours)}h AI in full while you worked elsewhere` : "";
  if (!r.unattendedHours) return bridged;
  const credited = r.unattendedCredited ?? r.unattendedHours * (r.unattendedWeight ?? 0);
  const bands = r.unattendedBands.filter((b) => b.hours > 0);
  // The v2.3 curve yields a band per quarter hour of depth, so past a handful
  // the note names the range the taper covered rather than every step.
  const pct = (w: number) => `${Math.round(w * 100)}%`;
  const split =
    bands.length > 3
      ? ` (tapering from ${pct(bands[0].weight)} to ${pct(bands[bands.length - 1].weight)})`
      : bands.length > 1
        ? ` (${bands.map((b) => `${fmt(b.hours)}h at ${pct(b.weight)}`).join(", ")})`
        : "";
  return `${bridged} · ${fmt(r.unattendedHours)}h unattended AI → +${fmt(credited)}h${split}`;
}

// The bridge review flag explains itself in the person's terms: how much machine
// time was lifted to full rate, on how few typed lines. It replaces the legacy
// "no session evidence" wording, which would be wrong for a v2 row.
export function bridgeReviewNote(r: LedgerRow): string {
  const lines = r.dayTurns ?? r.turns ?? 0;
  return `${fmt(r.attendedByActivityHours ?? 0)}h of machine time billed in full on ${lines} typed line${lines === 1 ? "" : "s"} that day. Check the person was there; override with a reason if not.`;
}

// A day that hit the cap is not a rounding note — it means the rule measured
// more clock than the person says they work, which points at duplicated effort
// upstream (overlapping sessions the union did not collapse). Say the number it
// wanted to bill, so the size of the gap is visible without opening evidence.
export function cappedNote(r: LedgerRow): string {
  if (!r.capped) return "";
  const wanted = r.rawDayTotal != null ? ` (rule measured ${fmt(r.rawDayTotal)}h)` : "";
  return ` · capped at the ${r.budget != null ? `${fmt(r.budget)}h ` : ""}daily limit${wanted}`;
}
