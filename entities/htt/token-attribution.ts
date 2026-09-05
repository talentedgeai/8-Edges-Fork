// Ported from the Human Token Tracker (lib/sync/token-attribution.ts), writing
// edge8's htt schema: project_id is now repo_id (htt.repos).
import { htt } from "@/kernel/data/supabase";
import { selectAll } from "./select-all";

/**
 * Per-PR Claude-token attribution, reused-branch-aware.
 *
 * Links unlinked `htt.token_entries` rows (`pull_request_id IS NULL`, non-null
 * `session_branch`) to ALREADY-STORED `htt.pull_requests` rows on the same repo
 * by matching `session_branch == head_branch`. This operates entirely on DB
 * rows (it does NOT fetch from GitHub), so it can run on any trigger: PR sync
 * OR token ingest.
 *
 * Cheap steady-state prefilter: the FIRST query selects the distinct branches
 * that have unlinked, branch-tagged tokens. If none exist we return 0
 * immediately.
 *
 * Why a time WINDOW and not just the branch: a branch name can be reused across
 * many PRs. Within each branch we partition time into non-overlapping windows,
 * one per PR, ordered by their close instant ascending (a still-open PR sorts
 * last):
 *
 *   - lower bound = the previous (in close order) same-branch PR's close
 *     instant (`merged_at ?? closed_at`). The FIRST PR to close on the branch
 *     has NO floor, which is what captures pre-open build sessions.
 *   - upper bound = THIS PR's close instant. A still-open PR has NO ceiling;
 *     open PRs sort last, so that open-ended window can never overlap an
 *     earlier same-branch PR's window.
 *
 * A token row links to PR i when `occurred_at` is in the half-open interval
 * (lower, upper]. Tokens whose `session_branch` matches no PR head_branch
 * (e.g. work on `main`) stay unlinked and repo-scoped: intentional and correct.
 *
 * Idempotent: only NULL -> uuid transitions happen (the update is gated on
 * `pull_request_id IS NULL`). Tolerant: a single failed per-PR update is
 * swallowed rather than aborting the whole pass.
 *
 * @returns the number of token rows newly linked in this pass.
 */
export async function relinkRepoTokens(repoId: string): Promise<number> {
  // Cheapest early-out FIRST: which branches even have unlinked, branch-tagged
  // tokens? In steady state this single SELECT returns nothing and we return 0
  // without fetching PRs or issuing a single UPDATE.
  const { data: unlinked, error: unErr } = await htt
    .from("token_entries")
    .select("session_branch")
    .eq("repo_id", repoId)
    .is("pull_request_id", null)
    .not("session_branch", "is", null);
  if (unErr) return 0;
  const branchesWithWork = new Set<string>(
    ((unlinked ?? []) as { session_branch: string | null }[])
      .map((r) => r.session_branch)
      .filter((b): b is string => !!b),
  );
  if (branchesWithWork.size === 0) return 0;

  // All PRs on this repo that carry a head branch: the only ones that can be a
  // join target. Paged, because a busy repo outgrows PostgREST's 1000-row cap
  // and a truncated PR set silently mis-partitions the branch windows.
  const { data: prRows, error: prErr } = await selectAll<PRWindowRow>((from, to) =>
    htt
      .from("pull_requests")
      .select("id, head_branch, opened_at, merged_at, closed_at", { count: "exact" })
      .eq("repo_id", repoId)
      .not("head_branch", "is", null)
      .order("id")
      .range(from, to),
  );
  if (prErr || prRows.length === 0) return 0;

  // Group PRs by head_branch, then compute each PR's (lower, upper] window in
  // time order. Done in JS (not SQL) so the reused-branch partitioning is
  // explicit and testable. Filter to ONLY branches that have unlinked work.
  const windows = computeBranchWindows(prRows).filter((w) => branchesWithWork.has(w.headBranch));

  let linked = 0;
  for (const w of windows) {
    let q = htt
      .from("token_entries")
      .update({ pull_request_id: w.prId })
      .is("pull_request_id", null) // idempotency: only ever NULL -> uuid
      .eq("repo_id", repoId)
      .eq("session_branch", w.headBranch);
    // (lower, upper]: exclusive lower so the previous PR's close instant belongs
    // to the previous PR; inclusive upper so this PR's close instant belongs to
    // this PR.
    if (w.lower !== null) q = q.gt("occurred_at", w.lower);
    if (w.upper !== null) q = q.lte("occurred_at", w.upper);

    const { data: updated, error } = await q.select("id");
    if (error) continue; // tolerant: one bad link must not abort the whole pass
    linked += updated?.length ?? 0;
  }
  return linked;
}

interface PRWindowRow {
  id: string;
  head_branch: string | null;
  opened_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

interface PRWindow {
  prId: string;
  headBranch: string;
  /** Exclusive lower bound (ISO) or null for -infinity (no floor). */
  lower: string | null;
  /** Inclusive upper bound (ISO) or null for +infinity (open PR). */
  upper: string | null;
}

/** A PR's close instant: merged wins over closed; null if still open. */
function closeInstant(pr: { merged_at: string | null; closed_at: string | null }): string | null {
  return pr.merged_at ?? pr.closed_at;
}

/**
 * Partition each reused branch's timeline into one (lower, upper] window per
 * PR. Exported for unit testing the boundary algorithm in isolation. Ordering
 * is by CLOSE instant ascending (a still-open PR sorts LAST), with `opened_at`
 * then `id` as deterministic tiebreakers. Close-instant order (not opened_at)
 * is what keeps windows non-overlapping when same-branch PRs have overlapping
 * lifetimes or close out of the order they opened.
 */
export function computeBranchWindows(prs: PRWindowRow[]): PRWindow[] {
  const byBranch = new Map<string, PRWindowRow[]>();
  for (const pr of prs) {
    if (!pr.head_branch) continue;
    const list = byBranch.get(pr.head_branch);
    if (list) list.push(pr);
    else byBranch.set(pr.head_branch, [pr]);
  }

  const windows: PRWindow[] = [];
  for (const [headBranch, group] of byBranch) {
    group.sort((a, b) => {
      const ca = closeInstant(a);
      const cb = closeInstant(b);
      if (ca !== cb) {
        if (ca === null) return 1; // a still open: sorts after b
        if (cb === null) return -1; // b still open: sorts after a
        return ca < cb ? -1 : 1;
      }
      if (a.opened_at !== b.opened_at) return a.opened_at < b.opened_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    let prevClose: string | null = null; // -infinity for the first PR to close on the branch
    for (const pr of group) {
      const thisClose = closeInstant(pr);
      windows.push({
        prId: pr.id,
        headBranch,
        lower: prevClose,
        upper: thisClose,
      });
      // Advance only on a finite close. Only a still-open PR leaves this null,
      // and open PRs sort last, so no later same-branch window reuses a stale
      // floor.
      if (thisClose !== null) prevClose = thisClose;
    }
  }
  return windows;
}
