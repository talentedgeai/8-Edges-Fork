/**
 * Orchestrates per-repo app-token ingest from .claude/project.json `app_tokens`.
 * Ported from the Human Token Tracker (lib/sync/ingest-app-tokens.ts):
 * client_id -> company_id, project_id -> repo_id.
 *
 * Pure orchestration with injected I/O deps. Idempotency: rows are persisted
 * via upsert on (repo_id, occurred_on, source) WHERE kind='app', backed by the
 * `token_entries_app_repo_day_source_uniq` partial unique index. Re-runs
 * overwrite rather than duplicate.
 */

interface AppTokenRepo {
  repo: string; // "owner/name" from htt.repos.github_repo
  companyId: string;
  repoId: string;
}

/** One entry from project.json app_tokens array. */
export interface AppTokenEntry {
  occurredOn: string; // 'YYYY-MM-DD'
  amount: number;
}

export interface AppTokenRow {
  company_id: string;
  repo_id: string;
  kind: "app";
  source: "app";
  amount: number;
  occurred_on: string;
  occurred_at: string; // ISO timestamptz (noon UTC of the day)
  status: "recorded";
}

export interface IngestAppTokenDeps {
  listRepos: () => Promise<AppTokenRepo[]>;
  readAppTokens: (repo: string) => Promise<AppTokenEntry[]>;
  /** Idempotent persist: caller must upsert on (repo_id, occurred_on, source). */
  persist: (rows: AppTokenRow[]) => Promise<void>;
}

interface IngestAppTokenSummary {
  repos: number;
  entries: number;
  rows: number;
}

export async function ingestAppTokens(deps: IngestAppTokenDeps): Promise<IngestAppTokenSummary> {
  const repos = await deps.listRepos();
  const all: AppTokenRow[] = [];
  let entries = 0;

  for (const p of repos) {
    const tokenEntries = await deps.readAppTokens(p.repo);
    for (const e of tokenEntries) {
      entries++;
      if (!e.occurredOn || e.amount <= 0) continue;
      all.push({
        company_id: p.companyId,
        repo_id: p.repoId,
        kind: "app",
        source: "app",
        amount: e.amount,
        occurred_on: e.occurredOn,
        occurred_at: `${e.occurredOn}T12:00:00Z`,
        status: "recorded",
      });
    }
  }

  if (all.length > 0) await deps.persist(all);

  return { repos: repos.length, entries, rows: all.length };
}
