// The library entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls the service-role Supabase client behind the
// published-document helpers, and a barrel is bundled whole, so a "use client"
// component may never import it. This file is the other door: only browser-safe
// code is re-exported here (types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// What is here is the hand-written workflow index the public site's hero stats
// and the 8 Edges app page — both client components — count and list. knip
// reports an export nothing imports.
export { allWorkflows } from "./lib/workflowsData";
