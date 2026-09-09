// Ported from the Human Token Tracker (lib/sync/session-ingest.ts), re-pointed
// to edge8's htt schema: client_id -> company_id, project_id -> repo_id, and
// repo resolution reads htt.repos instead of tracker projects.
import { htt } from "@/kernel/data/supabase";

export { sessionIntervalsFor, humanTurnsFor } from "./session-clock";

export interface TelemetryEntry {
  session_id?: string;
  record_type?: "human" | "claude";
  github_login: string;
  committer_login: string; // attached by the ingest script from `git log`
  author_email: string;
  repo_full_name: string;
  session_branch?: string | null;
  started_at: string;
  ended_at?: string;
  claude_tokens?: number;
  active_minutes?: number;
  // edge8-telemetry 1.4.0: every line the person typed, with its branch. The
  // hours rule reads THESE; active_intervals (all lines, 30-min gap) is legacy.
  human_turns?: Array<{ t: string; branch?: string | null; run_end?: string | null }>;
  human_intervals?: Array<{ start: string; end: string }>;
  human_active_minutes?: number;
  // schema v2 (edge8-telemetry >= 1.3.0): per-component usage + dominant model.
  // Absent on v1 records; passed through untouched so the edge function can store
  // them on the claude row. Pricing is a read-time concern, never stored.
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_write_tokens?: number;
  cache_write_5m_tokens?: number;
  cache_write_1h_tokens?: number;
  cache_read_tokens?: number;
  schema_version?: number;
  // Hands-on intervals from the recorder (plugin >= 1.2 and the local
  // backfill): the clock ran while messages were within 30 minutes of each
  // other. Older recorders send only active_minutes; see sessionIntervalsFor.
  active_intervals?: Array<{ start: string; end: string }>;
  // Legacy human-record fields. A `record_type: "human"` entry carried a
  // wall-clock day figure computed on the contributor's Mac; the hours rule
  // now derives days from sessions on the server, so these are ignored.
  occurred_on?: string;
  resolved_hours?: number;
  commit_hours?: number[];
}

interface ResolvedRepo {
  companyId: string;
  repoId: string;
}

export function verifyCommitter(e: TelemetryEntry): boolean {
  // committer_login is null when GitHub can't resolve the commit's author
  // (deleted account, or an api miss during delivery). Guard it: an unguarded
  // .toLowerCase() on null throws, and verifyCommitter runs OUTSIDE the
  // per-entry try/catch, so one such record would 500 the whole batch.
  return (
    !!e.github_login &&
    !!e.committer_login &&
    e.github_login.toLowerCase() === e.committer_login.toLowerCase()
  );
}

/** Schema-v2 fields that ride along on the claude row. */
export const USAGE_COMPONENT_KEYS = [
  "model",
  "input_tokens",
  "output_tokens",
  "cache_write_tokens",
  "cache_write_5m_tokens",
  "cache_write_1h_tokens",
  "cache_read_tokens",
  "schema_version",
] as const;

/** Body posted to ingest-session-end for a claude row; v2 fields present only when the record carried them. */
export type ClaudeEndBody = {
  company_id: string;
  repo_id: string;
  author_email: string;
  session_id: string;
  session_branch: string | null;
  source: "session";
  occurred_at: string | undefined;
  human_tokens: 0;
  claude_tokens: number;
} & Partial<Pick<TelemetryEntry, (typeof USAGE_COMPONENT_KEYS)[number]>>;

/**
 * Build the Claude token-row body. Returns `null` when the row cannot carry its
 * idempotency key, i.e. no `session_id` (the key is `(session_id, kind)`). A
 * keyless Claude row would re-insert on every re-ingest, so the caller must
 * skip it rather than forward it to the edge function (which 400s on it).
 */
export function buildEndBody(e: TelemetryEntry, ids: ResolvedRepo) {
  if (!e.session_id) return null;
  const body: ClaudeEndBody = {
    company_id: ids.companyId,
    repo_id: ids.repoId,
    author_email: e.author_email,
    session_id: e.session_id,
    session_branch: e.session_branch ?? null,
    source: "session",
    occurred_at: e.ended_at,
    human_tokens: 0,
    claude_tokens: e.claude_tokens ?? 0,
  };
  // Schema-v2 usage components: forwarded only when present, so a v1 record
  // produces a body identical to before (the edge function stores NULL then).
  for (const k of USAGE_COMPONENT_KEYS) {
    if (e[k] !== undefined) (body as Record<string, unknown>)[k] = e[k];
  }
  return body;
}

// Resolve repo_id + company_id from htt.repos.github_repo. Returns null if the
// repo is not onboarded.
export async function resolveRepo(repoFullName: string): Promise<ResolvedRepo | null> {
  const { data, error: reposError } = await htt
    .from("repos")
    .select("id, company_id")
    .eq("github_repo", repoFullName)
    .maybeSingle();
  if (reposError) console.error("[htt] repos read failed:", reposError.message);
  if (data) return { companyId: data.company_id, repoId: data.id };
  // Fall back to a repo's historical names (GitHub renames / org transfers).
  // Without this, renaming a repo orphans every past telemetry record. Aliases
  // are explicit per repo, so this does NOT auto-enroll an unknown repo.
  const { data: aliased, error: aliasedError } = await htt
    .from("repos")
    .select("id, company_id")
    .contains("github_repo_aliases", [repoFullName])
    .maybeSingle();
  if (aliasedError) console.error("[htt] repos read failed:", aliasedError.message);
  if (aliased) return { companyId: aliased.company_id, repoId: aliased.id };
  return null;
}

/** The people.id behind a git author email (people email or person_git_emails),
 *  or null when nobody claims it. Used to key work_sessions and the day rows. */
export async function resolveContributor(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data, error } = await htt.rpc("resolve_contributor", { p_email: email });
  if (error) {
    console.error("[htt] resolve_contributor failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}
