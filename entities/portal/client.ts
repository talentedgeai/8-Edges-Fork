// The portal entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls the work-request and token modules and with
// them the service-role Supabase client, and a barrel is bundled whole, so a
// "use client" component may never import it. This file is the other door:
// only browser-safe code is re-exported here (types, constants, pure helpers),
// and scripts/entity-client-doors.test.mjs walks its import graph to prove
// nothing server-only follows it into the browser.
//
// What is here is what the admin and team roadmap editors — both client
// components — read of the client backlog: the vocabulary, the row shapes and
// the two pure helpers. knip reports an export nothing imports.
export {
  BACKLOG_PRIORITIES,
  BACKLOG_STATUSES,
  PRIORITY_LABEL,
  effectivePriority,
  tokenLabel,
  type BacklogItem,
  type BacklogPriority,
  type BacklogStatus,
  type RoadmapGroup,
} from "./lib/client-backlog";
// The document row shape, for the admin and team document lists (types are
// erased at build, so a server module's type is safe here).
export type { ClientDocument } from "./lib/client-documents";
