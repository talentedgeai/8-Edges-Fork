/**
 * Minimal GitHub REST client for the htt ingestion pipeline.
 *
 * Ported from the Human Token Tracker's Octokit-based lib/github (client.ts +
 * pr-fetcher.ts). Rewritten on plain fetch so edge8-web takes no new npm
 * dependencies: the pipeline only needs four read endpoints (list PRs, get
 * repo, get file content, list commits). Behaviour is kept: primary token
 * GH_PAT with optional GH_PAT_FALLBACK, "no access" (404/403) means try the
 * next token, transient 5xx/429 retried with backoff.
 */

const API = "https://api.github.com";
const MAX_ATTEMPTS = 3;

export interface GitHubClient {
  /** PAT used for Authorization. Never log it. */
  token: string;
}

export class GitHubHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isNoAccessError(err: unknown): boolean {
  // 404 = repo not found or token has no visibility; 403 can mean a forbidden
  // scope on a private repo. Either way: try the next token.
  return err instanceof GitHubHttpError && (err.status === 404 || err.status === 403);
}

// Authenticated client for the central service account (CENTRAL_EMAIL).
// The PAT lives in GH_PAT: the single credential that reads every client repo.
export function createGitHubClient(): GitHubClient {
  const token = process.env.GH_PAT;
  if (!token) throw new Error("GH_PAT is not set");
  return { token };
}

// Ordered list of clients: primary GH_PAT first, GH_PAT_FALLBACK appended when
// set. Callers try clients in order and use the first with repo access.
export function createGitHubClients(): GitHubClient[] {
  const tokens = [process.env.GH_PAT, process.env.GH_PAT_FALLBACK].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  if (tokens.length === 0) throw new Error("GH_PAT is not set");
  return tokens.map((token) => ({ token }));
}

// The central service-account email: the identity that owns GH_PAT and the
// fallback author for PRs with no resolvable authorship block.
export function getCentralEmail(): string {
  return process.env.CENTRAL_EMAIL ?? "human-tokens@edge8.co";
}

async function ghJson<T>(client: GitHubClient, path: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${client.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "edge8-htt-ingest",
      },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    const err = new GitHubHttpError(res.status, `GitHub ${res.status} for ${path}: ${body.slice(0, 200)}`);
    // Transient: 5xx, or a rate limit (429, or 403 with a reset header). A plain
    // 403/404 is an access answer and must propagate so the caller can try the
    // fallback token.
    const rateLimited =
      res.status === 429 ||
      (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
    const transient = res.status >= 500 || rateLimited;
    if (!transient || attempt === MAX_ATTEMPTS) throw err;
    lastErr = err;
    console.warn(`GitHub ${res.status} on ${path}; retry ${attempt}/${MAX_ATTEMPTS}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw lastErr;
}

// ── PR fetching ──────────────────────────────────────────────────────────────

export type PrState = "open" | "merged" | "closed";

export interface FetchedPR {
  githubPrId: number; // GitHub's GLOBAL pr.id (unique across repos)
  number: number; // per-repo PR number
  title: string;
  body: string | null;
  authorLogin: string;
  url: string;
  headBranch: string | null; // PR head ref (branch name): exact key for token attribution
  state: PrState;
  openedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

interface ApiPr {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  html_url: string;
  head: { ref: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

function deriveState(mergedAt: string | null, closedAt: string | null): PrState {
  if (mergedAt) return "merged";
  if (closedAt) return "closed";
  return "open";
}

export async function fetchUpdatedPRs(
  client: GitHubClient,
  owner: string,
  repo: string,
  since: string | null,
): Promise<FetchedPR[]> {
  const cutoff = since ? new Date(since).getTime() : -Infinity;
  const out: FetchedPR[] = [];

  for (let page = 1; ; page++) {
    const data = await ghJson<ApiPr[]>(
      client,
      `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    if (data.length === 0) break;

    let hitCutoff = false;
    for (const pr of data) {
      if (new Date(pr.updated_at).getTime() < cutoff) {
        hitCutoff = true;
        break;
      }
      out.push({
        githubPrId: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        authorLogin: pr.user?.login ?? "unknown",
        url: pr.html_url,
        headBranch: pr.head?.ref ?? null,
        state: deriveState(pr.merged_at ?? null, pr.closed_at ?? null),
        openedAt: pr.created_at,
        mergedAt: pr.merged_at ?? null,
        closedAt: pr.closed_at ?? null,
        updatedAt: pr.updated_at,
      });
    }
    if (hitCutoff || data.length < 100) break;
  }

  return out;
}

// Tries each client in order. On a 404/403 (no access) it moves to the next
// token. Returns the first successful result. Only throws if every client fails.
export async function fetchUpdatedPRsWithFallback(
  clients: GitHubClient[],
  owner: string,
  repo: string,
  since: string | null,
): Promise<FetchedPR[]> {
  if (clients.length === 0) throw new Error("fetchUpdatedPRsWithFallback: no clients provided");

  let lastError: unknown;
  for (let i = 0; i < clients.length; i++) {
    try {
      const result = await fetchUpdatedPRs(clients[i], owner, repo, since);
      if (i > 0) console.info(`PR sync for ${owner}/${repo}: fallback token (index ${i}) succeeded`);
      return result;
    } catch (err) {
      lastError = err;
      if (isNoAccessError(err) && i < clients.length - 1) {
        console.warn(`PR sync for ${owner}/${repo}: token index ${i} has no access, trying next token`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Reads a repo's GitHub "homepage" (the About-section URL). Same fallback rules
// as fetchUpdatedPRsWithFallback. Returns null when the field is empty.
export async function fetchRepoHomepageWithFallback(
  clients: GitHubClient[],
  owner: string,
  repo: string,
): Promise<string | null> {
  if (clients.length === 0) throw new Error("fetchRepoHomepageWithFallback: no clients provided");

  let lastError: unknown;
  for (let i = 0; i < clients.length; i++) {
    try {
      const data = await ghJson<{ homepage: string | null }>(clients[i], `/repos/${owner}/${repo}`);
      const homepage = (data.homepage ?? "").trim();
      return homepage.length > 0 ? homepage : null;
    } catch (err) {
      lastError = err;
      if (isNoAccessError(err) && i < clients.length - 1) continue;
      throw err;
    }
  }
  throw lastError;
}

// ── Repo file content ────────────────────────────────────────────────────────

export interface RepoFile {
  /** Decoded UTF-8 content. */
  text: string;
  sha: string;
}

/**
 * Read one file from a repo's default branch via the contents API. Throws a
 * GitHubHttpError on any failure (including 404), so callers can distinguish
 * "no access, try the fallback token" from "definitively not a file" (null).
 * Returns null when the path exists but is not a file (a directory listing).
 */
export async function fetchRepoFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
): Promise<RepoFile | null> {
  const data = await ghJson<
    { type?: string; content?: string; sha?: string } | Array<unknown>
  >(client, `/repos/${owner}/${repo}/contents/${path}`);
  if (Array.isArray(data) || data.type !== "file" || !data.content || !data.sha) return null;
  return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

/** ISO date of the most recent commit touching `path`, or null. */
export async function fetchLastCommitDate(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const commits = await ghJson<Array<{ commit?: { committer?: { date?: string } } }>>(
    client,
    `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
  );
  return commits[0]?.commit?.committer?.date ?? null;
}
