// The Supabase tables the retreats entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The list is deliberately a plain string tuple
// rather than keys of the generated Database type: `public_retreats`,
// `private_session_blocks` and the `trip_*` tables are read by code but absent
// from the types snapshot, so typing this against it would not compile.
//
// The names here and the `tables` array for retreats in entities.manifest.json
// are the same list — entities/retreats/entity.test.ts asserts that, so the
// gate and the entity can never drift apart.
export const RETREATS_TABLES = [
  "event_registrations",
  "private_session_blocks",
  "public_retreats",
  "trip_families",
  "trip_flights",
  "trip_members",
  "trip_passports",
] as const;
