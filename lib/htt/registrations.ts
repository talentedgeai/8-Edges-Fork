// Server-side registration processing, ported from scripts/htt/process-registrations.mjs.
//
// The script version runs in GitHub Actions and needs SUPABASE_* secrets there; this
// module runs inside the nightly htt-sync-prs cron on Vercel, where the service-role
// client and GH_PAT already live — so GitHub needs no database secrets at all. The
// telemetry branch is pure storage: contributors commit registrations/<owner>__<repo>.json
// there, and this reads them via the GitHub API, verifies the committer, applies, and
// best-effort deletes the processed file.
//
// Invariants preserved from the script (and pipeline-regression-check):
//   - no auto-enroll: only explicit registration files are processed;
//   - committer verification: the GitHub login of the file's last committer must match
//     the request's github_login, or the file is rejected;
//   - idempotent: an already-registered repo is a noop, so an undeletable file (GH_PAT
//     without write access to this repo) is harmless and retried harmlessly nightly.

import { htt, companyOs } from "@/lib/supabase";
import { GitHubHttpError, isNoAccessError, type GitHubClient } from "./github";
import { slugify } from "@/lib/slug";

/** The repo whose telemetry branch carries registration files. */
const REGISTRY_REPO = "talentedgeai/edge8-web";
const BRANCH = "telemetry";
const DIR = "registrations";
const API = "https://api.github.com";

export interface RegistrationRequest {
  repo_full_name: string;
  github_login: string;
  type: "personal" | "client";
  project_name: string;
  client: { name: string };
  exclude_identities?: Array<{
    git_email?: string | null;
    github_login?: string | null;
    label?: string | null;
  }>;
}

export interface RegistrationsSummary {
  processed: number;
  applied: number;
  noops: number;
  rejected: number;
  notes: string[];
}

/** Validate the shape of a registration request. Returns null if valid. */
export function validateRequest(req: unknown): string | null {
  const r = req as RegistrationRequest;
  if (!r || typeof r !== "object") return "not an object";
  if (typeof r.repo_full_name !== "string" || !r.repo_full_name.includes("/"))
    return "invalid repo_full_name";
  if (typeof r.github_login !== "string" || !r.github_login) return "missing github_login";
  if (r.type !== "personal" && r.type !== "client") return 'type must be "personal" or "client"';
  if (typeof r.project_name !== "string" || !r.project_name) return "missing project_name";
  if (!r.client || typeof r.client !== "object") return "missing client object";
  if (typeof r.client.name !== "string" || !r.client.name) return "missing client.name";
  return null;
}

async function gh<T>(
  client: GitHubClient,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${client.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "edge8-htt-registrations",
    },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GitHubHttpError(res.status, `GitHub ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** First client that can read the registry repo; reads fall back like the PR sync. */
async function ghRead<T>(clients: GitHubClient[], path: string): Promise<T> {
  let lastErr: unknown;
  for (const client of clients) {
    try {
      return await gh<T>(client, path);
    } catch (err) {
      if (!isNoAccessError(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Apply one validated registration. Ported 1:1 from the script:
 * company upsert by name (flagged is_ai_program) -> ai_program + htt.repos
 * (1 repo = 1 AI Program = 1 htt.repos row; existing repo = noop) ->
 * client_identities excludes -> committer email recorded as a discovered alias.
 */
export async function applyRegistration(
  req: RegistrationRequest,
  committerEmail: string | null,
): Promise<{ status: "applied" | "noop"; notes: string[] }> {
  const notes: string[] = [];

  let companyId: string;
  {
    const { data: existing } = await companyOs
      .from("companies")
      .select("id, is_ai_program")
      .eq("name", req.client.name)
      .maybeSingle();
    if (existing) {
      companyId = existing.id;
      notes.push(`company exists: ${req.client.name}`);
      if (!existing.is_ai_program) {
        await companyOs.from("companies").update({ is_ai_program: true }).eq("id", companyId);
        notes.push("company flagged is_ai_program");
      }
    } else {
      const { data: inserted, error } = await companyOs
        .from("companies")
        .insert({ name: req.client.name, is_ai_program: true })
        .select("id")
        .single();
      if (error) throw new Error(`insert company failed: ${error.message}`);
      companyId = inserted.id;
      notes.push(`company created: ${req.client.name}`);
    }
  }

  let repoId: string;
  {
    const { data: existing } = await htt
      .from("repos")
      .select("id")
      .eq("github_repo", req.repo_full_name)
      .maybeSingle();
    if (existing) {
      notes.push(`repo already registered for ${req.repo_full_name}: no-op`);
      return { status: "noop", notes };
    }

    const { data: program, error: progErr } = await companyOs
      .from("ai_programs")
      .insert({
        company_id: companyId,
        name: req.project_name,
        status: "active",
        github_repo: req.repo_full_name,
        repo_url: `https://github.com/${req.repo_full_name}`,
        created_by: "htt-registration",
      })
      .select("id")
      .single();
    if (progErr) throw new Error(`insert ai_program failed: ${progErr.message}`);
    notes.push(`ai_program created: ${req.project_name}`);

    const { data: inserted, error } = await htt
      .from("repos")
      .insert({
        ai_program_id: program.id,
        company_id: companyId,
        name: req.project_name,
        slug: slugify(req.project_name),
        github_repo: req.repo_full_name,
        status: "active",
        created_by: "htt-registration",
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert htt.repos failed: ${error.message}`);
    repoId = inserted.id;
    notes.push(`repo created: ${req.repo_full_name}`);
  }

  if (req.type === "client" && Array.isArray(req.exclude_identities)) {
    for (const identity of req.exclude_identities) {
      const { data: existing } = await htt
        .from("client_identities")
        .select("id")
        .eq("repo_id", repoId)
        .ilike("git_email", identity.git_email ?? "")
        .maybeSingle();
      if (!existing) {
        const { error } = await htt.from("client_identities").insert({
          repo_id: repoId,
          git_email: identity.git_email ?? null,
          github_login: identity.github_login ?? null,
          label: identity.label ?? null,
        });
        notes.push(
          error
            ? `WARN: insert client_identity failed for ${identity.git_email}: ${error.message}`
            : `client_identity added: ${identity.git_email}`,
        );
      }
    }
  }

  if (committerEmail) {
    const { data: resolved } = await htt.rpc("resolve_contributor", { p_email: committerEmail });
    if (resolved) {
      const { data: aliasExists } = await companyOs
        .from("person_git_emails")
        .select("id")
        .eq("git_email", committerEmail)
        .maybeSingle();
      if (!aliasExists) {
        const { error } = await companyOs.from("person_git_emails").insert({
          git_email: committerEmail,
          person_id: resolved,
          source: "discovered",
        });
        notes.push(
          error
            ? `WARN: insert person_git_emails failed: ${error.message}`
            : `git email recorded for ${committerEmail}`,
        );
      }
    } else {
      notes.push(`no person found for ${committerEmail}: repo created, contributor resolves later`);
    }
  }

  return { status: "applied", notes };
}

interface ContentsEntry {
  name: string;
  path: string;
  sha: string;
}
interface FileContent {
  content: string;
  encoding: string;
  sha: string;
}
interface CommitEntry {
  author: { login: string } | null;
  commit: { author: { email: string | null } | null };
}

/**
 * Process every pending registration file on the telemetry branch. Never throws for
 * per-file problems (they are rejected with a note); a missing branch or directory is
 * an ordinary empty result, so the cron stays a no-op until someone registers a repo.
 */
export async function processRegistrations(
  clients: GitHubClient[],
): Promise<RegistrationsSummary> {
  const summary: RegistrationsSummary = { processed: 0, applied: 0, noops: 0, rejected: 0, notes: [] };

  let entries: ContentsEntry[];
  try {
    entries = await ghRead<ContentsEntry[]>(
      clients,
      `/repos/${REGISTRY_REPO}/contents/${DIR}?ref=${BRANCH}`,
    );
  } catch (err) {
    if (isNoAccessError(err)) return summary; // no branch / no dir / no access: nothing to do
    throw err;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".json")) continue;
    summary.processed++;
    try {
      const file = await ghRead<FileContent>(
        clients,
        `/repos/${REGISTRY_REPO}/contents/${entry.path}?ref=${BRANCH}`,
      );
      const raw = Buffer.from(file.content, "base64").toString("utf8");
      const req = JSON.parse(raw) as RegistrationRequest;

      const invalid = validateRequest(req);
      if (invalid) {
        summary.rejected++;
        summary.notes.push(`REJECT ${entry.name}: invalid: ${invalid}`);
        continue;
      }

      // Committer verification: the GitHub login of the last commit touching this
      // file must match the request's github_login.
      const commits = await ghRead<CommitEntry[]>(
        clients,
        `/repos/${REGISTRY_REPO}/commits?path=${encodeURIComponent(entry.path)}&sha=${BRANCH}&per_page=1`,
      );
      const committerLogin = commits[0]?.author?.login ?? null;
      if (!committerLogin || committerLogin.toLowerCase() !== req.github_login.toLowerCase()) {
        summary.rejected++;
        summary.notes.push(
          `REJECT ${entry.name}: committer=${committerLogin ?? "unresolved"} != ${req.github_login}`,
        );
        continue;
      }

      const committerEmail = commits[0]?.commit?.author?.email ?? null;
      const result = await applyRegistration(req, committerEmail);
      if (result.status === "applied") summary.applied++;
      else summary.noops++;
      summary.notes.push(`${result.status} ${req.repo_full_name}: ${result.notes.join("; ")}`);

      // Best-effort delete of the processed file (needs write access on this repo;
      // apply is idempotent, so a leftover file just noops on the next run).
      try {
        await gh(clients[0], `/repos/${REGISTRY_REPO}/contents/${entry.path}`, {
          method: "DELETE",
          body: { message: `registered: ${req.repo_full_name}`, sha: file.sha, branch: BRANCH },
        });
      } catch {
        summary.notes.push(`WARN: could not delete ${entry.name} (no write access?); harmless`);
      }
    } catch (err) {
      summary.rejected++;
      summary.notes.push(
        `REJECT ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return summary;
}
