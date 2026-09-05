// The company-os entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls the service-role Supabase client, the admin
// auth guard and next/headers, and a barrel is bundled whole, so a "use client"
// component may never import it. This file is the other door: only browser-safe
// code is re-exported here (client components, types, constants, pure helpers),
// and scripts/entity-client-doors.test.mjs walks its import graph to prove
// nothing server-only follows it into the browser.
//
// What is here is what the portal's public survey runner — a client component —
// reads of the surveys module: the field vocabulary and the rating bounds, split
// out of lib/surveys.ts for exactly this door. knip reports an export nothing
// imports.
export { ratingBounds, type FieldType, type SurveyFieldRow } from "./lib/surveys-schema";