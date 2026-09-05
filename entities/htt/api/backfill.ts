import { NextRequest, NextResponse } from "next/server";
import { htt } from "@/kernel/data/supabase";
import { createGitHubClient, fetchUpdatedPRs } from "@/entities/htt/github";
import { upsertPRs } from "@/entities/htt/upsert-prs";
import { resolveAuthorPersonIdByLogin } from "@/entities/htt/resolve-author";
import { selectAll } from "@/entities/htt/select-all";

/**
 * PR backfill, ported from the Human Token Tracker (api/sync/backfill).
 * Auth: Bearer CRON_SECRET. Two modes:
 *
 * - `full` (default): re-fetch the repo's entire GitHub PR history and upsert it.
 * - `reattribute`: makes NO GitHub calls. Re-runs author resolution over the
 *   stored `htt.pull_requests` rows that have `author_person_id is null` and
 *   writes back only the ones that now resolve. Defaults to a dry run: an
 *   explicit dryRun: false is the only way to write.
 */
type BackfillMode = "full" | "reattribute";

interface BackfillBody {
  repoId?: string;
  mode?: BackfillMode;
  dryRun?: boolean;
}

/** How many ids to put in a single `.in()` predicate: keeps the request URL bounded. */
const UPDATE_CHUNK = 200;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface OrphanRow {
  id: string;
  author_login: string | null;
}

interface ReattributeResult {
  mode: "reattribute";
  dryRun: boolean;
  /** Stored PRs on this repo with author_person_id = null. */
  scanned: number;
  /** Of those, how many now resolve to a person. */
  resolvable: number;
  /** Rows actually written. Always 0 on a dry run. */
  updated: number;
  /** Resolvable row count per author_login: the review surface before a real run. */
  byLogin: Record<string, number>;
  /** Still-unresolvable row count per author_login. These need a people mapping. */
  unresolvedByLogin: Record<string, number>;
}

/**
 * Re-run author resolution over already-stored PRs. No GitHub API calls.
 *
 * Idempotency: only rows whose `author_person_id` is null are ever considered,
 * and the UPDATE repeats that predicate, so a second run over the same data
 * writes nothing. Nothing is inserted (not even a sync_runs row) so a dry run
 * is a genuine read-only pass.
 */
async function reattribute(repoId: string, dryRun: boolean): Promise<ReattributeResult> {
  const { data: rows, error } = await selectAll<OrphanRow>((from, to) =>
    htt
      .from("pull_requests")
      .select("id, author_login", { count: "exact" })
      .eq("repo_id", repoId)
      .is("author_person_id", null)
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(error.message);

  // Group by login so each distinct login costs exactly one RPC, not one per PR.
  const idsByLogin = new Map<string, string[]>();
  for (const row of rows) {
    const login = row.author_login;
    if (!login) continue;
    const bucket = idsByLogin.get(login);
    if (bucket) bucket.push(row.id);
    else idsByLogin.set(login, [row.id]);
  }

  const byLogin: Record<string, number> = {};
  const unresolvedByLogin: Record<string, number> = {};
  let resolvable = 0;
  let updated = 0;

  for (const [login, ids] of idsByLogin) {
    const personId = await resolveAuthorPersonIdByLogin(login);
    if (!personId) {
      unresolvedByLogin[login] = ids.length;
      continue;
    }
    byLogin[login] = ids.length;
    resolvable += ids.length;
    if (dryRun) continue;

    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK);
      const { data, error: upErr } = await htt
        .from("pull_requests")
        .update({ author_person_id: personId })
        .in("id", chunk)
        .is("author_person_id", null) // idempotency: never overwrite an attribution
        .select("id");
      if (upErr) throw new Error(upErr.message);
      updated += (data ?? []).length;
    }
  }

  return {
    mode: "reattribute",
    dryRun,
    scanned: rows.length,
    resolvable,
    updated,
    byLogin,
    unresolvedByLogin,
  };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as BackfillBody;
  const { repoId } = body;
  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }

  const mode: BackfillMode = body.mode ?? "full";
  if (mode !== "full" && mode !== "reattribute") {
    return NextResponse.json({ error: "mode must be 'full' or 'reattribute'" }, { status: 400 });
  }

  const { data: repoRow, error } = await htt
    .from("repos")
    .select("id, github_repo")
    .eq("id", repoId)
    .single();

  if (mode === "reattribute") {
    if (error || !repoRow) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }
    // Re-attribution is a live-numbers change, so it defaults to a dry run.
    const dryRun = body.dryRun !== false;
    return NextResponse.json(await reattribute(repoId, dryRun));
  }

  if (error || !repoRow?.github_repo) {
    return NextResponse.json({ error: "Repo not found or has no github_repo" }, { status: 404 });
  }
  if (!process.env.GH_PAT) {
    return NextResponse.json({ ok: false, skipped: "GH_PAT not configured" });
  }

  const [owner, repo] = String(repoRow.github_repo).split("/");
  const github = createGitHubClient();

  const { data: run } = await htt
    .from("sync_runs")
    .insert({ started_at: new Date().toISOString(), backfill: true })
    .select()
    .single();

  const prs = await fetchUpdatedPRs(github, owner, repo, null); // null = full history
  const r = await upsertPRs(repoId, prs);

  if (run) {
    await htt
      .from("sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        projects_synced: 1,
        prs_upserted: r.upserted,
        unattributed: r.unattributed,
      })
      .eq("id", run.id);
  }

  return NextResponse.json(r);
}
