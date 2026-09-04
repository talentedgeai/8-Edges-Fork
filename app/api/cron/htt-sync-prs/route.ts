import { NextResponse } from "next/server";
import { htt } from "@/lib/supabase";
import { createGitHubClients, fetchUpdatedPRsWithFallback, fetchRepoHomepageWithFallback } from "@/lib/htt/github";
import { upsertPRs } from "@/lib/htt/upsert-prs";
import { processRegistrations, type RegistrationsSummary } from "@/lib/htt/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Nightly PR sync, ported from the Human Token Tracker (api/cron/sync-prs).
 * For every htt.repos row with a github_repo: fetch PRs updated since
 * last_synced_at, upsert into htt.pull_requests (resolving authors to
 * company_os.people via the htt resolvers), mirror the repo homepage into
 * htt.repos.live_url, and record a htt.sync_runs row.
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron invokes the endpoint with an HTTP GET (and the Authorization:
// Bearer $CRON_SECRET header). POST is kept as an alias for manual triggering.
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GH_PAT) {
    // Pre-cutover no-op: the cron is scheduled but the GitHub service-account
    // PAT has not been configured yet (see docs/plans/htt/PHASE4-RUNBOOK.md).
    return NextResponse.json({ ok: false, skipped: "GH_PAT not configured" });
  }

  const githubClients = createGitHubClients();

  // Registration requests are processed FIRST so repos exist before their PRs
  // sync — same ordering as the Actions workflow, but running here means GitHub
  // needs no database secrets: the telemetry branch is pure storage and this
  // route already holds the service-role client and GH_PAT.
  let registrations: RegistrationsSummary = { processed: 0, applied: 0, noops: 0, rejected: 0, notes: [] };
  try {
    registrations = await processRegistrations(githubClients);
  } catch (err: unknown) {
    registrations.notes.push(err instanceof Error ? err.message : String(err));
  }

  const { data: run } = await htt
    .from("sync_runs")
    .insert({ started_at: new Date().toISOString() })
    .select()
    .single();

  const { data: repos, error: repoErr } = await htt
    .from("repos")
    .select("id, github_repo, last_synced_at")
    .not("github_repo", "is", null)
    .neq("status", "archived"); // archived repos are no longer synced

  if (repoErr || !repos) {
    if (run) {
      await htt
        .from("sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          errors: [{ message: repoErr?.message ?? "no repos" }],
        })
        .eq("id", run.id);
    }
    return NextResponse.json({ error: "Failed to load repos" }, { status: 500 });
  }

  const errors: Array<{ repoId: string; message: string }> = [];
  let reposSynced = 0;
  let prsUpserted = 0;
  let unattributed = 0;
  let tokensLinked = 0;

  for (const repoRow of repos) {
    const [owner, repo] = String(repoRow.github_repo).split("/");
    if (!owner || !repo) {
      errors.push({ repoId: repoRow.id, message: `bad github_repo "${repoRow.github_repo}"` });
      continue;
    }
    try {
      const prs = await fetchUpdatedPRsWithFallback(
        githubClients,
        owner,
        repo,
        repoRow.last_synced_at ?? null,
      );
      const r = await upsertPRs(repoRow.id, prs);
      prsUpserted += r.upserted;
      unattributed += r.unattributed;
      tokensLinked += r.tokensLinked;
      reposSynced++;

      // Mirror the repo's GitHub homepage into htt.repos.live_url. Best-effort:
      // a failure here must not fail the PR sync.
      try {
        const homepage = await fetchRepoHomepageWithFallback(githubClients, owner, repo);
        await htt.from("repos").update({ live_url: homepage }).eq("id", repoRow.id);
      } catch {
        // No access / transient error reading the repo homepage: keep the
        // existing live_url rather than clobbering it.
      }
    } catch (err: unknown) {
      errors.push({
        repoId: repoRow.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (run) {
    await htt
      .from("sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        projects_synced: reposSynced,
        prs_upserted: prsUpserted,
        unattributed,
        errors,
      })
      .eq("id", run.id);
  }

  return NextResponse.json({ registrations, reposSynced, prsUpserted, unattributed, tokensLinked, errors });
}

// Manual trigger: same authorized handler, invoked via POST.
export const POST = GET;
