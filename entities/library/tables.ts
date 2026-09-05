// The Supabase tables the library entity owns (multi-entity design §4, and the
// `tables` array for `library` in entities.manifest.json, which is what
// scripts/check-table-ownership.mjs actually reads).
//
// The list is empty, and that is the finding rather than an omission: the
// workflow pages are hand-written React, the private library index is a
// hand-maintained TypeScript array, and every published document lives in a
// Supabase Storage bucket or on disk under private-docs/. Nothing here writes a
// row. The declaration exists anyway so the entity has the same two-file
// surface as every other one, and so the day the library grows a table the
// owner is already stated here.
export const LIBRARY_TABLES = [] as const;
