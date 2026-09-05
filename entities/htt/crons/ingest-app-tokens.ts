import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { htt } from "@/kernel/data/supabase";
import { createGitHubClient, fetchRepoFile, type GitHubClient } from "@/entities/htt/github";
import {
  ingestAppTokens,
  type AppTokenEntry,
  type AppTokenRow,
  type IngestAppTokenDeps,
} from "@/entities/htt/ingest-app-tokens";

/**
 * App-token ingest, ported from the Human Token Tracker
 * (api/cron/ingest-app-tokens). Reads each repo's committed
 * `.claude/project.json` app_tokens array and upserts kind='app'
 * htt.token_entries rows. Deliberately NOT scheduled in vercel.json (same as
 * the source): invoke manually with the Vercel Cron bearer (withRoutineRun
 * checks it).
 */

type HandlerDeps = Pick<IngestAppTokenDeps, "listRepos" | "readAppTokens" | "persist">;

function createHandler(deps: HandlerDeps) {
  return async function handler(): Promise<Response> {
    const summary = await ingestAppTokens(deps);
    return NextResponse.json({ ok: true, ...summary });
  };
}

async function readAppTokensFromGitHub(gh: GitHubClient, repo: string): Promise<AppTokenEntry[]> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return [];
  try {
    const file = await fetchRepoFile(gh, owner, name, ".claude/project.json");
    if (!file) return [];
    const json = JSON.parse(file.text);
    if (!Array.isArray(json?.app_tokens)) return [];
    return (json.app_tokens as Array<{ occurred_on?: string; amount?: number }>).map((e) => ({
      occurredOn: e.occurred_on ?? "",
      amount: typeof e.amount === "number" ? e.amount : 0,
    }));
  } catch {
    return [];
  }
}

// Idempotent persist. The only unique index covering app rows is PARTIAL
// (token_entries_app_repo_day_source_uniq WHERE kind='app'), which Postgres
// refuses as an ON CONFLICT arbiter without the predicate, so an upsert cannot
// be used here. Instead: delete any existing kind='app' rows for the same
// (repo_id, occurred_on, source) keys, then insert. Both steps check errors and
// throw so the route reports a real failure instead of ok:true.
async function persistDeleteInsert(rows: AppTokenRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Delete per repo (bounded key lists): app rows are one per (repo, day, source).
  const byRepo = new Map<string, AppTokenRow[]>();
  for (const r of rows) {
    const bucket = byRepo.get(r.repo_id);
    if (bucket) bucket.push(r);
    else byRepo.set(r.repo_id, [r]);
  }
  for (const [repoId, repoRows] of byRepo) {
    const days = [...new Set(repoRows.map((r) => r.occurred_on))];
    const { error: delErr } = await htt
      .from("token_entries")
      .delete()
      .eq("kind", "app")
      .eq("repo_id", repoId)
      .eq("source", "app")
      .in("occurred_on", days);
    if (delErr) throw new Error(`app-token delete failed for repo ${repoId}: ${delErr.message}`);
  }
  const { error: insErr } = await htt.from("token_entries").insert(rows);
  if (insErr) throw new Error(`app-token insert failed: ${insErr.message}`);
}

async function handler(req: Request) {
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

  const repos = (repoRows ?? []).map((p) => ({
    repo: p.github_repo as string,
    companyId: p.company_id as string,
    repoId: p.id as string,
  }));

  const handler = createHandler({
    listRepos: async () => repos,
    readAppTokens: (repo) => readAppTokensFromGitHub(gh, repo),
    persist: (rows) => persistDeleteInsert(rows),
  });

  try {
    return await handler();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Manual-only until the hosted pipeline has secrets, but a manual run is still a run:
// recorded in company_os.routine_runs like every other cron entry point.
export const GET = (req: Request) => withRoutineRun("/api/cron/htt-ingest-app-tokens/", req, handler);
