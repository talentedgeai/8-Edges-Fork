// The Supabase tables the time-off entity owns (design §4; moved off team by
// FS-03 along with the code that writes them).
//
// Ownership means time-off is the only entity that writes these directly;
// everyone else goes through this entity's index.ts. The gate that enforces it
// (scripts/check-table-ownership.mjs) reads the same list from the `tables`
// array on `time-off` in entities.manifest.json, because the gate runs on a
// fresh checkout with no TypeScript toolchain. This file is the in-code half of
// that declaration, and tables.test.ts fails if the two ever disagree.
export const TIME_OFF_TABLES = [
  "leave_adjustments",
  "leave_policies",
  "time_off",
] as const;
