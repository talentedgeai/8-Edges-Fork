// Evidence helpers for the hours ledger: parsing what a work_sessions row
// stores, and naming the PRs a day's human turns belong to.
import { htt } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import type { HumanTurn, SessionInterval } from "./day-hours";

export function parseIntervals(json: Json): SessionInterval[] {
  if (!Array.isArray(json)) return [];
  const out: SessionInterval[] = [];
  for (const item of json) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      if (typeof o.start === "string" && typeof o.end === "string") out.push({ start: o.start, end: o.end });
    }
  }
  return out;
}

export function parseTurns(json: Json): HumanTurn[] {
  if (!Array.isArray(json)) return [];
  const out: HumanTurn[] = [];
  for (const item of json) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      if (typeof o.t === "string")
        out.push({
          t: o.t,
          branch: typeof o.branch === "string" && o.branch ? o.branch : null,
          runEnd: typeof o.run_end === "string" ? o.run_end : null,
        });
    }
  }
  return out;
}

export type PrRow = { repo_id: string; number: number; head_branch: string | null; opened_at: string | null; merged_at: string | null; closed_at: string | null };

/** pull_requests keyed by `${repoId}|${headBranch}` for every branch the rows touch. */
export async function loadPrsForBranches(rows: Array<{ repoId: string; branches: Record<string, number> }>): Promise<Map<string, PrRow[]>> {
  const out = new Map<string, PrRow[]>();
  const repoIds = [...new Set(rows.map((r) => r.repoId))];
  const branches = [...new Set(rows.flatMap((r) => Object.keys(r.branches)).filter((b) => b !== "(none)"))];
  if (repoIds.length === 0 || branches.length === 0) return out;
  const { data, error } = await htt
    .from("pull_requests")
    .select("repo_id, number, head_branch, opened_at, merged_at, closed_at")
    .in("repo_id", repoIds)
    .in("head_branch", branches);
  if (error) throw new Error(`pull_requests read failed: ${error.message}`);
  for (const pr of (data ?? []) as PrRow[]) {
    if (!pr.head_branch) continue;
    const key = `${pr.repo_id}|${pr.head_branch}`;
    out.set(key, [...(out.get(key) ?? []), pr]);
  }
  return out;
}
