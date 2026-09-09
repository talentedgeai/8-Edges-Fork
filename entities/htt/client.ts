// The Human Token Tracker's client door (multi-entity design §3, "two doors per
// entity", ME-13). Every entity has one so a "use client" component anywhere in
// the tree has a browser-safe path in that never reaches ./index.ts, which is a
// server-only barrel (the GitHub client, the ingest pipeline and the
// service-role Supabase client sit behind it).
//
// What lives here must stay browser-safe; scripts/entity-client-doors.test.mjs
// checks it. The hours ledger component is the first export: the admin AI
// Program page and the team portal's program page both render it and hand it
// their own server actions.
export { HoursLedger } from "./ui/HoursLedger";
export type { LedgerRow } from "./ledger-types";
// The Set bought form on the admin Client Hub renders the allocation kinds.
export { TOKEN_ALLOCATION_KINDS, TOKEN_ALLOCATION_KIND_LABELS } from "./lib/token-allocation-kinds";
