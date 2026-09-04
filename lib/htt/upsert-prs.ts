// Ported from the Human Token Tracker (lib/sync/upsert-prs.ts), writing edge8's
// htt schema: projects -> htt.repos, project_id -> repo_id, and the resolved
// author is stored as author_person_id (company_os.people.id).
import { htt } from "@/lib/supabase";
import type { FetchedPR } from "./github";
import { getCentralEmail } from "./github";
import { parseAuthorBlock } from "./author-parser";
import { resolvePrAuthorPersonId } from "./resolve-author";
import { relinkRepoTokens } from "./token-attribution";

export interface UpsertResult {
  upserted: number;
  unattributed: number;
  /** token_entries rows back-filled with a pull_request_id via the branch key. */
  tokensLinked: number;
}

export async function upsertPRs(repoId: string, prs: FetchedPR[]): Promise<UpsertResult> {
  if (prs.length === 0) return { upserted: 0, unattributed: 0, tokensLinked: 0 };

  let unattributed = 0;
  const rows = [];
  for (const pr of prs) {
    const { authorEmail } = parseAuthorBlock(pr.body);
    // Email (the author block) first, then the GitHub login as the fallback.
    // Resolution uses the RAW fetched login, never the getCentralEmail()
    // substitution applied to the stored author_login below.
    const authorPersonId = await resolvePrAuthorPersonId({
      email: authorEmail,
      login: pr.authorLogin,
    });
    if (!authorPersonId) unattributed++;
    rows.push({
      repo_id: repoId,
      github_pr_id: pr.githubPrId,
      number: pr.number,
      title: pr.title,
      // Preserve the real GitHub login (incl. external contributors); fall back
      // to the configured central service identity only when GitHub gives us
      // nothing.
      author_login: pr.authorLogin === "unknown" ? getCentralEmail() : pr.authorLogin,
      author_person_id: authorPersonId,
      url: pr.url,
      head_branch: pr.headBranch,
      state: pr.state,
      opened_at: pr.openedAt,
      merged_at: pr.mergedAt,
      closed_at: pr.closedAt,
    });
  }

  const { error } = await htt.from("pull_requests").upsert(rows, { onConflict: "github_pr_id" });
  if (error) throw new Error(error.message);

  const maxUpdated = prs.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), prs[0].updatedAt);
  const { error: updateError } = await htt
    .from("repos")
    .update({ last_synced_at: maxUpdated })
    .eq("id", repoId);
  if (updateError) throw new Error(updateError.message);

  // Exact per-PR token attribution: link unlinked session token rows to their
  // PR by matching session_branch to head_branch on this repo. Runs after the
  // upsert so the PRs (and their uuids) exist to point at.
  const tokensLinked = await relinkRepoTokens(repoId);

  return { upserted: rows.length, unattributed, tokensLinked };
}
