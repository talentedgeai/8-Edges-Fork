/**
 * The Supabase tables the Human Token Tracker owns (design §4, rule 5).
 *
 * Every name here lives in the dedicated `htt` Postgres schema except
 * `company_github_orgs`, which sits in `company_os` because the registration
 * flow matches a GitHub organisation to a company before an htt row exists.
 * Only this entity writes them. Other entities still read several of them
 * directly (the team and portal dashboards); those reads sit in
 * `scripts/table-ownership-baseline.json` and may only fall as each caller
 * moves behind `entities/htt/index.ts` or an RPC.
 *
 * This list must equal `entities.htt.tables` in `entities.manifest.json`, which
 * is what `scripts/check-table-ownership.mjs` enforces the ownership with;
 * `tables.test.ts` fails if the two drift apart.
 */
export const HTT_TABLES = [
  "client_identities",
  "company_github_orgs",
  "man_hour_entries",
  "project_goals",
  "project_summaries",
  "pull_requests",
  "repos",
  "sync_runs",
  "token_allocations",
  "token_entries",
] as const;
