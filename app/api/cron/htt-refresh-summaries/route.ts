import { NextResponse } from "next/server";
import { htt } from "@/lib/supabase";
import { refreshRepoSummaries, recentDigestPrs, GenerationBudget } from "@/lib/htt/project-summaries";
import { refreshRepoGoal } from "@/lib/htt/project-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Nightly summary refresh, ported from the Human Token Tracker
 * (api/cron/refresh-summaries). GET (Vercel cron, after the PR sync so
 * digests read fresh PRs) sweeps every repo; POST force-regenerates ONE
 * repo's executive summary (body: { "repo": "owner/name" }; the tracker's
 * client/project slug pair is gone because edge8 companies have no slug).
 *
 * Cost rules live in refreshRepoSummaries: exec is written once then pinned,
 * digests regenerate only when the PR set changed, and the whole run shares
 * one GenerationBudget as a circuit breaker.
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Nightly sweep across every repo. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GH_PAT || !process.env.ANTHROPIC_API_KEY) {
    // Pre-cutover no-op (see docs/plans/htt/PHASE4-RUNBOOK.md).
    return NextResponse.json({ ok: false, skipped: "GH_PAT / ANTHROPIC_API_KEY not configured" });
  }

  // Up to three model calls per repo (exec, digest, goal metric); the cap is a
  // circuit breaker, not a target: steady-state nights make only a handful of
  // calls.
  const budget = new GenerationBudget(40);

  const { data: repos, error } = await htt
    .from("repos")
    .select("id, name, github_repo")
    .not("github_repo", "is", null)
    .neq("status", "archived"); // archived repos are no longer refreshed
  if (error || !repos) {
    return NextResponse.json({ error: error?.message ?? "no repos" }, { status: 500 });
  }

  const report: Record<string, unknown>[] = [];
  for (const p of repos as { id: string; name: string; github_repo: string }[]) {
    const prs = await recentDigestPrs(p.id);
    const result = await refreshRepoSummaries({ id: p.id, repo: p.github_repo }, prs, budget);
    // The FAST goal metric: suggested when the repo has none yet, replaced when
    // the status page's fingerprint changed, skipped otherwise.
    const goal = await refreshRepoGoal({ id: p.id, name: p.name, repo: p.github_repo }, budget);
    report.push({ repo: p.github_repo, ...result, goal });
    if (budget.exhausted) break; // circuit breaker: stop the sweep, report it
  }

  return NextResponse.json({
    repos: repos.length,
    modelCalls: budget.spent,
    budgetExhausted: budget.exhausted,
    report,
  });
}

/**
 * Force-regenerate ONE repo's executive summary. Body: { "repo": "owner/name" }.
 * This is the "updated only when prompted" path; nothing else can rewrite a
 * pinned summary.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { repo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.repo) {
    return NextResponse.json({ error: "repo (owner/name) is required" }, { status: 400 });
  }

  const { data: repoRow } = await htt
    .from("repos")
    .select("id, github_repo")
    .eq("github_repo", body.repo)
    .maybeSingle();
  if (!repoRow?.github_repo) {
    return NextResponse.json({ error: "unknown repo" }, { status: 404 });
  }

  const budget = new GenerationBudget(2); // one exec + at most one digest
  const prs = await recentDigestPrs(repoRow.id);
  const result = await refreshRepoSummaries(
    { id: repoRow.id, repo: repoRow.github_repo },
    prs,
    budget,
    { forceExecutive: true },
  );

  return NextResponse.json({ repo: repoRow.github_repo, modelCalls: budget.spent, ...result });
}
