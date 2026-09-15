// The Supabase tables the team entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The names here and the `tables` array for team
// in entities.manifest.json are the same list — entities/team/entity.test.ts
// asserts that, so the gate and the entity can never drift apart.
// FS-03 moved the leave tables (time_off, leave_policies, leave_adjustments) to
// the time-off entity along with the code that writes them.
export const TEAM_TABLES = [
  "holidays",
  "performance_reviews",
] as const;
