/**
 * Parse a repo's `.claude/project.json` effort_log into idempotent
 * htt.token_entries rows. Ported from the Human Token Tracker
 * (lib/sync/effort-log-ingest.ts): client_id -> company_id, project_id ->
 * repo_id.
 *
 * Each effort_log entry yields a `claude` token row (tokens.total) and a
 * `human` token row (active_hours as centihours). Pure + idempotent:
 *   - claude row keyed on session_id
 *   - human row keyed on session_id + '-h' (so the two never collide on the
 *     (person, repo, day, kind) unique index)
 * Rows missing an idempotency key (no session_id) or a day (no occurred_on)
 * are dropped, because either would let a re-ingest double-count.
 */

export interface EffortLogEntry {
  session_id: string;
  occurred_on: string;
  started_at?: string | null;
  active_hours?: number | null;
  tokens?: { total?: number | null } | null;
  tool?: string | null;
  contributor_email?: string | null;
}

export interface IngestIds {
  companyId: string;
  repoId: string;
}

export interface TokenEntryBody {
  company_id: string;
  repo_id: string;
  kind: "claude" | "human";
  amount: number;
  source: "effort-log";
  occurred_at: string;
  occurred_on: string;
  session_id: string;
}

/** Build the claude + human rows for one effort_log entry. Returns [] if unkeyable. */
export function buildEffortRows(entry: EffortLogEntry, ids: IngestIds): TokenEntryBody[] {
  if (!entry.session_id || !entry.occurred_on) return [];

  const occurredAt = entry.started_at || `${entry.occurred_on}T12:00:00+07:00`;
  const base = {
    company_id: ids.companyId,
    repo_id: ids.repoId,
    source: "effort-log" as const,
    occurred_at: occurredAt,
    occurred_on: entry.occurred_on,
  };

  const rows: TokenEntryBody[] = [];

  const claudeTokens = entry.tokens?.total ?? 0;
  if (claudeTokens > 0) {
    rows.push({ ...base, kind: "claude", amount: claudeTokens, session_id: entry.session_id });
  }

  const centihours = Math.round((entry.active_hours ?? 0) * 100);
  if (centihours > 0) {
    rows.push({ ...base, kind: "human", amount: centihours, session_id: `${entry.session_id}-h` });
  }

  return rows;
}
