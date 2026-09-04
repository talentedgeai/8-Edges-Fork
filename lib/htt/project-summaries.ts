import { createHash } from "node:crypto";
import { htt } from "@/lib/supabase";
import { createGitHubClients, fetchRepoFile, fetchLastCommitDate, GitHubHttpError } from "./github";
import { summarizeStatusPage, summarizeLatestPrs, summaryModel } from "./ai/summarize";

/**
 * The two AI-written stories on a repo, and the rules for when the model is
 * allowed to run. Ported from the Human Token Tracker (the GENERATION path of
 * lib/data/project-summaries.ts; the dashboard read path stayed behind with
 * the retired tracker UI). project_id is now repo_id (htt.repos).
 *
 * The cost model is deliberate and strict:
 * - The executive summary is written once (by the nightly refresh, when the
 *   repo has a status page) and after that changes ONLY when explicitly
 *   regenerated.
 * - The PR digest refreshes nightly, and only for repos whose PR set actually
 *   changed since the last run. No change, no call.
 * - Every refresh run carries a generation budget as a circuit breaker: even a
 *   fingerprint bug cannot loop the API.
 */

const STATUS_PATH = "docs/project-status.html";
const DIGEST_PR_COUNT = 10;

/** Marker stored as source_key when the repo has no status page. */
export const NO_STATUS_PAGE = "no-status-page";

/** Minimal PR shape the digest needs. */
export interface DigestPr {
  num: number;
  title: string;
  author: string;
  state: string;
  /** Display-only; never part of the fingerprint. */
  date: string;
}

interface SummaryRow {
  kind: string;
  content: string;
  as_of: string | null;
  source_key: string;
}

// ── pure helpers ─────────────────────────────────────────────────────────────

/**
 * Fingerprint of the PR set. Number + state only: humanized dates would differ
 * between callers and cause paid double generation, so they are excluded.
 */
export function digestSourceKey(prs: DigestPr[]): string {
  const basis = prs
    .slice(0, DIGEST_PR_COUNT)
    .map((p) => `${p.num}:${p.state}`)
    .join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

export type ExecutiveDecision = "skip" | "generate";

/** The exec summary is written once, then pinned until explicitly forced. */
export function executiveDecision(row: SummaryRow | undefined, force: boolean): ExecutiveDecision {
  if (force) return "generate";
  return row ? "skip" : "generate";
}

/** The digest refreshes only when the PR set changed. */
export function digestDecision(row: SummaryRow | undefined, key: string): "skip" | "generate" {
  return row && row.source_key === key ? "skip" : "generate";
}

// ── generation path (cron + regenerate only) ────────────────────────────────

/** Shared per-run circuit breaker: hard cap on model calls. */
export class GenerationBudget {
  private used = 0;
  constructor(private readonly cap: number = 25) {}
  take(): boolean {
    if (this.used >= this.cap) return false;
    this.used += 1;
    return true;
  }
  get spent(): number {
    return this.used;
  }
  get exhausted(): boolean {
    return this.used >= this.cap;
  }
}

export interface RefreshResult {
  executive: "generated" | "skipped" | "no_status_page" | "budget_exhausted" | "failed";
  digest: "generated" | "skipped" | "no_prs" | "budget_exhausted" | "failed";
}

/**
 * Refresh one repo's summaries per the rules above. Idempotent: upserts on
 * (repo_id, kind); a re-run with unchanged sources writes nothing.
 */
export async function refreshRepoSummaries(
  repo: { id: string; repo: string },
  prs: DigestPr[],
  budget: GenerationBudget,
  opts: { forceExecutive?: boolean } = {},
): Promise<RefreshResult> {
  const { data } = await htt
    .from("project_summaries")
    .select("kind, content, as_of, source_key")
    .eq("repo_id", repo.id);
  const rows = (data ?? []) as SummaryRow[];
  const execRow = rows.find((r) => r.kind === "executive");
  const digestRow = rows.find((r) => r.kind === "latest_prs");

  const result: RefreshResult = { executive: "skipped", digest: "skipped" };

  // Executive: once, then only when forced.
  if (executiveDecision(execRow, opts.forceExecutive ?? false) === "generate") {
    const page = await fetchStatusPage(repo.repo);
    if (!page) {
      // Remember "no status page" so the next nightly run does not re-fetch a
      // repo we know is empty (it does re-check GitHub, cheap, no model call).
      await storeSummary(repo.id, "executive", "", null, NO_STATUS_PAGE);
      result.executive = "no_status_page";
    } else if (!budget.take()) {
      result.executive = "budget_exhausted";
    } else {
      const content = await summarizeStatusPage(page.html);
      if (content) {
        await storeSummary(repo.id, "executive", content, page.lastChanged, page.sha);
        result.executive = "generated";
      } else {
        result.executive = "failed";
      }
    }
  }

  // Digest: nightly, only on change.
  if (prs.length === 0) {
    result.digest = "no_prs";
  } else {
    const key = digestSourceKey(prs);
    if (digestDecision(digestRow, key) === "generate") {
      if (!budget.take()) {
        result.digest = "budget_exhausted";
      } else {
        const content = await summarizeLatestPrs(
          prs.slice(0, DIGEST_PR_COUNT).map((p) => ({
            title: p.title,
            author: p.author,
            state: p.state,
            date: p.date,
          })),
        );
        if (content) {
          await storeSummary(repo.id, "latest_prs", content, new Date().toISOString(), key);
          result.digest = "generated";
        } else {
          result.digest = "failed";
        }
      }
    }
  }

  return result;
}

interface PrRow {
  number: number;
  title: string | null;
  author_login: string | null;
  state: string;
  merged_at: string | null;
  opened_at: string | null;
}

/** The digest's input: the repo's ten most recent PRs, from the raw record. */
export async function recentDigestPrs(repoId: string): Promise<DigestPr[]> {
  const { data } = await htt
    .from("pull_requests")
    .select("number, title, author_login, state, merged_at, opened_at")
    .eq("repo_id", repoId)
    .order("merged_at", { ascending: false, nullsFirst: false })
    .limit(DIGEST_PR_COUNT);
  return ((data ?? []) as PrRow[]).map((pr) => ({
    num: pr.number,
    title: pr.title ?? "untitled",
    author: pr.author_login ?? "unknown",
    state: pr.state,
    date: (pr.merged_at ?? pr.opened_at ?? "").slice(0, 10),
  }));
}

/** Also used by the goal-metric refresh (project-goals.ts), same fingerprint. */
export async function fetchStatusPage(
  repo: string,
): Promise<{ html: string; sha: string; lastChanged: string | null } | null> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  // Try each client in order (primary GH_PAT, then GH_PAT_FALLBACK). GitHub
  // returns 404 for a private repo a token cannot see, indistinguishable from
  // a genuinely missing file, so a 404 (or 403) means "this token has no
  // access; try the next one", NOT "there is no status page". Only after every
  // client has failed do we report null.
  for (const gh of createGitHubClients()) {
    try {
      const file = await fetchRepoFile(gh, owner, name, STATUS_PATH);
      // A non-file (directory listing) at this path is a definitive "no status
      // page" for this repo: the same answer from any token, so stop here.
      if (!file) return null;
      let lastChanged: string | null = null;
      try {
        lastChanged = await fetchLastCommitDate(gh, owner, name, STATUS_PATH);
      } catch {
        // No commit date is fine; the summary just stores without one.
      }
      return { html: file.text, sha: file.sha, lastChanged };
    } catch (err) {
      // No access with this token (404/403) or a transient error: try the next
      // client. If none succeed, fall through to null below.
      if (!(err instanceof GitHubHttpError)) console.warn(`[htt summaries] ${repo}: ${err}`);
    }
  }
  return null;
}

async function storeSummary(
  repoId: string,
  kind: "executive" | "latest_prs",
  content: string,
  asOf: string | null,
  sourceKey: string,
): Promise<void> {
  await htt.from("project_summaries").upsert(
    {
      repo_id: repoId,
      kind,
      content,
      as_of: asOf,
      source_key: sourceKey,
      model: summaryModel(),
      generated_at: new Date().toISOString(),
    },
    { onConflict: "repo_id,kind" },
  );
}

// ───── read path for the program pages ─────

/** A summary older than this (by its source's last-change instant) renders a stale note. */
export const STALE_AFTER_DAYS = 7;

export interface RepoStoryBlock {
  content: string;
  asOf: string | null;
  stale: boolean;
}

export interface RepoStory {
  executive: RepoStoryBlock | null;
  latestPrs: RepoStoryBlock | null;
}

/**
 * Cached story for one repo — a pure read for the program pages. Never calls the
 * model and never throws: any error or missing row renders as null, and the page
 * simply omits the card. The NO_STATUS_PAGE sentinel (empty content) is treated
 * as absent, not as an empty card.
 */
export async function getRepoStory(repoId: string): Promise<RepoStory> {
  const empty: RepoStory = { executive: null, latestPrs: null };
  try {
    const { data, error } = await htt
      .from("project_summaries")
      .select("kind, content, as_of, source_key")
      .eq("repo_id", repoId);
    if (error) return empty;
    const rows = (data ?? []) as SummaryRow[];
    const block = (kind: "executive" | "latest_prs"): RepoStoryBlock | null => {
      const row = rows.find((r) => r.kind === kind);
      if (!row || !row.content.trim() || row.source_key === NO_STATUS_PAGE) return null;
      const asOfMs = row.as_of ? Date.parse(row.as_of) : NaN;
      const stale =
        !Number.isNaN(asOfMs) && Date.now() - asOfMs > STALE_AFTER_DAYS * 24 * 3_600_000;
      return { content: row.content, asOf: row.as_of, stale };
    };
    return { executive: block("executive"), latestPrs: block("latest_prs") };
  } catch {
    return empty;
  }
}
