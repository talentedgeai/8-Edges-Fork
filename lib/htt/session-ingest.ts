// Ported from the Human Token Tracker (lib/sync/session-ingest.ts), re-pointed
// to edge8's htt schema: client_id -> company_id, project_id -> repo_id, and
// repo resolution reads htt.repos instead of tracker projects.
import { htt } from "@/lib/supabase";

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
  // human-record fields:
  occurred_on?: string;
  resolved_hours?: number;
  commit_hours?: number[];
}

export interface ResolvedRepo {
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

/**
 * Build the Claude token-row body. Returns `null` when the row cannot carry its
 * idempotency key, i.e. no `session_id` (the key is `(session_id, kind)`). A
 * keyless Claude row would re-insert on every re-ingest, so the caller must
 * skip it rather than forward it to the edge function (which 400s on it).
 */
export function buildEndBody(e: TelemetryEntry, ids: ResolvedRepo) {
  if (!e.session_id) return null;
  return {
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
}

/**
 * Build the man-hour body for a day: exactly ONE row per (person, repo, day),
 * carrying the session's `resolved_hours` (the canonical billed figure), pinned
 * to `occurred_hour = 0` as a stable per-day slot. One row per day, merged by
 * the edge function on (person, repo, day), is dedup-able by construction.
 * Returns `[]` when `occurred_on` is missing or there's nothing to record.
 */
export function buildManHourBodies(e: TelemetryEntry, ids: ResolvedRepo) {
  if (!e.occurred_on) return [];
  const resolved = e.resolved_hours ?? 0;
  if (resolved <= 0) return [];
  return [
    {
      company_id: ids.companyId,
      repo_id: ids.repoId,
      author_email: e.author_email,
      primary_role: null,
      occurred_on: e.occurred_on,
      occurred_hour: 0,
      hours: resolved,
      started_at: e.started_at,
    },
  ];
}

/**
 * Build the per-day human-effort token-row body. Returns `null` when
 * `occurred_on` is missing: the idempotency key is
 * `(person_id, repo_id, occurred_on, kind)`, so a row with no `occurred_on`
 * would escape dedup and double-count on re-ingest.
 */
export function buildHumanEndBody(e: TelemetryEntry, ids: ResolvedRepo) {
  if (!e.occurred_on) return null;
  return {
    company_id: ids.companyId,
    repo_id: ids.repoId,
    author_email: e.author_email,
    occurred_on: e.occurred_on,
    occurred_at: e.started_at,
    source: "session",
    session_branch: null,
    human_tokens: Math.round((e.resolved_hours ?? 0) * 100),
    claude_tokens: 0,
  };
}

// Resolve repo_id + company_id from htt.repos.github_repo. Returns null if the
// repo is not onboarded.
export async function resolveRepo(repoFullName: string): Promise<ResolvedRepo | null> {
  const { data } = await htt
    .from("repos")
    .select("id, company_id")
    .eq("github_repo", repoFullName)
    .maybeSingle();
  if (data) return { companyId: data.company_id, repoId: data.id };
  // Fall back to a repo's historical names (GitHub renames / org transfers).
  // Without this, renaming a repo orphans every past telemetry record. Aliases
  // are explicit per repo, so this does NOT auto-enroll an unknown repo.
  const { data: aliased } = await htt
    .from("repos")
    .select("id, company_id")
    .contains("github_repo_aliases", [repoFullName])
    .maybeSingle();
  if (aliased) return { companyId: aliased.company_id, repoId: aliased.id };
  return null;
}
