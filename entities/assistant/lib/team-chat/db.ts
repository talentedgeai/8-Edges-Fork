// Server-only. Restricted SQL executor for the /team portal assistant.
//
// Reads run through the dedicated `team_chatbot_reader` Postgres role
// (supabase/migrations/20260720160000_team_chatbot_reader_and_knowledge.sql).
// Unlike the admin assistant's chatbot_reader, this role is DEFAULT-DENY: it has
// USAGE on company_os and SELECT on an explicit allow-list of tables only, so
// payroll, compensation, sensitive PII, recruiting/candidate data, survey
// responses, and the like are unreachable at the database layer no matter what
// SQL the model emits. Defense in depth, each layer independently sufficient:
//   1. validation in ../read-executor.ts (single SELECT/WITH statement only)
//   2. structural wrap: the query runs as a subquery, so DML cannot escape
//   3. the extended protocol rejects multi-statement strings
//   4. the role's grants make writes, DDL, other schemas, and every non-allowed
//      table impossible at the database layer regardless of the SQL text
//   5. role-level statement_timeout of 5s
//
// This module never writes: there is no team writer role and no write executor.
// NEVER import from a client component.

import { makeReadExecutor } from "../read-executor";

// Crown-jewel company_os tables the role cannot read anyway (denied by omission
// from the allow-list). Named here too so a coaxed query gets a clear message
// instead of a bare "permission denied", and as one more layer against a model
// being steered toward payroll/PII. The grants remain the hard boundary.
const BLOCKED_TABLE =
  /\b(?:people_sensitive|compensation_sensitive|compensation|performance_reviews|one_on_ones|goals|applications|candidates|candidate_profile|survey_responses|survey_answers|audit_log|coaching_profiles|coaching_one_on_ones|coaching_commitments|coaching_checkins|coaching_trends|coaching_context|coaching_priorities|coaching_ocean_profiles|coaching_goal_comments)\b/i;

export const runReadOnlyQuery = makeReadExecutor({
  envVar: "TEAM_CHATBOT_DB_URL",
  logPrefix: "team-chat/db",
  poolMax: 3,
  blocked: {
    pattern: BLOCKED_TABLE,
    message:
      "That table is off-limits to the team assistant (payroll, compensation, " +
      "sensitive personal data, recruiting/candidate records, survey responses, " +
      "and audit logs are not readable here). Answer from the tables you can read.",
  },
});
