// One-off reconcile for the human hours ledger (plan PR 4). Every
// `auto_session` row that predates the hours rule (no measured figure) is
// capped at its person's daily focus budget and flagged `needs_review`, so the
// Hours ledger shows it at the top for a human to confirm or correct.
// Idempotent: a flagged row is not touched again.
//
// Usage (repo root, .env.local present):
//   npx --yes tsx --tsconfig tsconfig.json scripts/htt/reconcile-hours.mts
import { readFileSync } from "node:fs";

// .env.local must be loaded BEFORE kernel/data/supabase is imported, so the
// entity import below is dynamic.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.local)");
}

const { flagUnmeasuredDays } = await import("@/entities/htt");
const flagged = await flagUnmeasuredDays();
console.log(JSON.stringify({ flagged }));
