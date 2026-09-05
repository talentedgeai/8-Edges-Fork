// The Supabase tables the team entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The names here and the `tables` array for team
// in entities.manifest.json are the same list — entities/team/entity.test.ts
// asserts that, so the gate and the entity can never drift apart.
export const TEAM_TABLES = [
  "coaching_checkins",
  "coaching_commitments",
  "coaching_context",
  "coaching_goal_comments",
  "coaching_ocean_profiles",
  "coaching_one_on_ones",
  "coaching_priorities",
  "coaching_profiles",
  "coaching_talking_points",
  "coaching_trends",
  "dayoff_snapshot",
  "goals",
  "holidays",
  "leave_adjustments",
  "leave_policies",
  "onboarding_plans",
  "onboarding_tasks",
  "performance_reviews",
  "person_git_emails",
  "time_off",
] as const;
