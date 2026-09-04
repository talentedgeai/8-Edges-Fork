/**
 * Orchestrates the "project.json piggyback" ingest: for every htt repo, read
 * its committed `.claude/project.json` effort_log, turn each entry into
 * htt.token_entries rows, and persist them idempotently. Ported from the Human
 * Token Tracker (lib/sync/ingest-effort-logs.ts).
 *
 * Pure orchestration with injected I/O (deps) so it is unit-testable; the cron
 * route supplies the real GitHub-read + Supabase-write implementations.
 *
 * Idempotency note: owner (client) effort has no person_id, so the
 * (person_id, repo_id, occurred_on, kind) unique index can't dedupe it (NULLs
 * are distinct). The `persist` dep therefore must dedupe by session_id
 * (delete-then-insert), not rely on ON CONFLICT.
 */
import { buildEffortRows, type EffortLogEntry, type TokenEntryBody } from "./effort-log-ingest";

export interface EffortLogRepo {
  repo: string; // "owner/name" from htt.repos.github_repo
  companyId: string;
  repoId: string;
}

export interface IngestEffortDeps {
  /** Registered repos to scan (those with a github_repo). */
  listRepos: () => Promise<EffortLogRepo[]>;
  /** Parsed `effort_log` array for a repo, or [] when absent/unreadable. Must not throw. */
  readEffortLog: (repo: string) => Promise<EffortLogEntry[]>;
  /** Idempotent persist (dedupe by session_id). Called once with all rows; skipped if empty. */
  persist: (rows: TokenEntryBody[]) => Promise<void>;
}

export interface IngestEffortSummary {
  repos: number;
  entries: number;
  rows: number;
  skipped: number; // entries that produced no rows (unkeyable / empty)
}

export async function ingestEffortLogs(deps: IngestEffortDeps): Promise<IngestEffortSummary> {
  const repos = await deps.listRepos();
  const all: TokenEntryBody[] = [];
  let entries = 0;
  let skipped = 0;

  for (const p of repos) {
    const log = await deps.readEffortLog(p.repo);
    for (const e of log) {
      entries++;
      const rows = buildEffortRows(e, { companyId: p.companyId, repoId: p.repoId });
      if (rows.length === 0) skipped++;
      else all.push(...rows);
    }
  }

  if (all.length > 0) await deps.persist(all);

  return { repos: repos.length, entries, rows: all.length, skipped };
}
