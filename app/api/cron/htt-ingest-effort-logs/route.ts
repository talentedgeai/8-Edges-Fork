import { NextResponse } from "next/server";
import { htt } from "@/lib/supabase";
import { createGitHubClient, fetchRepoFile, type GitHubClient } from "@/lib/htt/github";
import { ingestEffortLogs, type EffortLogRepo } from "@/lib/htt/ingest-effort-logs";
import type { EffortLogEntry, TokenEntryBody } from "@/lib/htt/effort-log-ingest";
import { buildOwnerEmailSet, isOwnerEmail, type ClientIdentityRow } from "@/lib/htt/contributor-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Nightly effort-log ingest, ported from the Human Token Tracker
 * (api/cron/ingest-effort-logs). Reads each repo's committed
 * `.claude/project.json` effort_log; OWNER-ONLY entries become
 * htt.token_entries rows (Edge8 contributors are already captured via the
 * normal telemetry path; ingesting their effort_log entries here would
 * double-count them).
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Read a repo's committed `.claude/project.json` effort_log. Never throws: a
 *  missing file (404) or unparseable JSON yields []. */
async function readRepoEffortLog(gh: GitHubClient, repo: string): Promise<EffortLogEntry[]> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return [];
  try {
    const file = await fetchRepoFile(gh, owner, name, ".claude/project.json");
    if (!file) return [];
    const json = JSON.parse(file.text);
    return Array.isArray(json?.effort_log) ? (json.effort_log as EffortLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Idempotent persist keyed on session_id: delete any existing rows for these
 *  session_ids, then insert. Owner rows have a null person_id, so the
 *  (person, repo, day, kind) unique index cannot dedupe them; session_id is
 *  the durable key. (Insert-before-delete is not possible: the fresh rows
 *  would collide with the existing ones on (session_id, kind).) Both steps
 *  check errors and throw; a failed insert after the delete surfaces as a 500
 *  so the loss is visible and the next run re-ingests the same session_ids. */
async function persistIdempotent(rows: TokenEntryBody[]): Promise<void> {
  if (rows.length === 0) return;
  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const { error: delErr } = await htt.from("token_entries").delete().in("session_id", sessionIds);
  if (delErr) throw new Error(`effort-log delete failed: ${delErr.message}`);
  const { error: insErr } = await htt
    .from("token_entries")
    .insert(rows.map((r) => ({ ...r, status: "recorded" })));
  if (insErr) throw new Error(`effort-log insert failed: ${insErr.message}`);
}

// Vercel Cron invokes via GET with the Authorization: Bearer $CRON_SECRET header.
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GH_PAT) {
    // Pre-cutover no-op (see docs/plans/htt/PHASE4-RUNBOOK.md).
    return NextResponse.json({ ok: false, skipped: "GH_PAT not configured" });
  }

  const gh = createGitHubClient();

  const { data: repoRows, error: repoErr } = await htt
    .from("repos")
    .select("id, company_id, github_repo")
    .not("github_repo", "is", null)
    .neq("status", "archived"); // archived repos are no longer ingested
  if (repoErr) return NextResponse.json({ error: repoErr.message }, { status: 500 });

  const { data: identityRows } = await htt
    .from("client_identities")
    .select("repo_id, github_login, git_email");
  const identities = (identityRows ?? []) as ClientIdentityRow[];

  const repos: EffortLogRepo[] = (repoRows ?? []).map((p) => ({
    repo: p.github_repo as string,
    companyId: p.company_id as string,
    repoId: p.id as string,
  }));
  const repoByName = new Map(repos.map((p) => [p.repo, p]));
  const ownerEmailsByRepo = new Map(
    repos.map((p) => [p.repoId, buildOwnerEmailSet(identities, p.repoId)]),
  );

  try {
    const summary = await ingestEffortLogs({
      listRepos: async () => repos,
      readEffortLog: async (repo) => {
        const entry = repoByName.get(repo);
        if (!entry) return [];
        const entries = await readRepoEffortLog(gh, repo);
        const ownerEmails = ownerEmailsByRepo.get(entry.repoId) ?? new Set<string>();
        // OWNER-ONLY: Edge8 contributors are already captured via the normal
        // telemetry path; ingesting their effort_log entries here would
        // double-count them.
        return entries.filter((e) => isOwnerEmail(e.contributor_email ?? null, ownerEmails));
      },
      persist: (rows) => persistIdempotent(rows),
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const POST = GET; // manual trigger alias
