import { htt } from "@/kernel/data/supabase";
import { fetchStatusPage, NO_STATUS_PAGE, GenerationBudget } from "./project-summaries";
import { suggestGoalMetric, type GoalSuggestion } from "./ai/suggest-goal";

/**
 * FAST goals, generation path only. Ported from the Human Token Tracker
 * (lib/data/project-goals.ts); the page read/write paths stayed behind with
 * the retired tracker UI. project_id is now repo_id (htt.repos).
 *
 * One live goal per repo in the grammar "[quantity] [state] [object] per
 * [period]". The metric comes from the client's own status page when stated
 * there, otherwise from the nightly AI suggestion; a manual goal (source
 * 'manual') is never overwritten by the nightly pass.
 *
 * Cost rules match the summaries: the suggestion runs only on the nightly
 * refresh, only when the repo has no goal yet or its status page changed (git
 * blob sha), inside the shared GenerationBudget.
 */

// The grammar vocabulary is a leaf shared with the AI suggestion.
import { composeMetric, type GoalPeriod } from "./goal-grammar";

type GoalSource = "stated" | "suggested" | "manual";

interface RepoGoal {
  /** Display phrase, "[state] [object]" (e.g. "won leads"). */
  metric: string;
  /** The countable state qualifier ("won"). */
  state: string | null;
  /** The counted object, plural ("leads"). Stored in the unit column. */
  unit: string;
  period: GoalPeriod;
  quantity: number | null;
  source: GoalSource;
  sourceKey: string;
  setBy: string;
  createdAt: string;
}

interface GoalRow {
  metric: string;
  state: string | null;
  unit: string;
  period: string;
  quantity: number | string | null;
  source: string;
  source_key: string;
  set_by: string;
  created_at: string;
}

const GOAL_COLUMNS = "metric, state, unit, period, quantity, source, source_key, set_by, created_at";

// ── pure helpers ─────────────────────────────────────────────────────────────

/**
 * The suggestion runs only when there is no goal yet or the page changed, and
 * never over a manual goal. Manual wins until the client changes it.
 */
export function goalRefreshDecision(
  latest: { source_key: string; source?: string } | null | undefined,
  currentKey: string,
): "skip" | "generate" {
  if (latest?.source === "manual") return "skip";
  return latest && latest.source_key === currentKey ? "skip" : "generate";
}

/**
 * The quantity channel is the text box: a client's typed quantity survives a
 * page-sha change as long as the metric shape is unchanged. Only a new shape
 * resets the quantity, in which case a quantity explicitly stated on the page
 * fills in.
 */
export function carryQuantity(
  latest: Pick<RepoGoal, "metric" | "state" | "unit" | "period" | "quantity"> | null | undefined,
  suggestion: GoalSuggestion,
): number | null {
  const sameShape =
    latest &&
    latest.metric === suggestion.metric &&
    (latest.state ?? null) === (suggestion.state ?? null) &&
    latest.unit === suggestion.unit &&
    latest.period === suggestion.period;
  if (sameShape) return latest.quantity;
  return suggestion.quantity ?? null;
}

function toGoal(row: GoalRow): RepoGoal {
  return {
    metric: row.metric,
    state: row.state ?? null,
    unit: row.unit,
    period: row.period as GoalPeriod,
    quantity: row.quantity == null ? null : Number(row.quantity),
    source: row.source as GoalSource,
    sourceKey: row.source_key,
    setBy: row.set_by,
    createdAt: row.created_at,
  };
}

async function latestGoalRow(repoId: string): Promise<GoalRow | null> {
  const { data: row } = await htt
    .from("project_goals")
    .select(GOAL_COLUMNS)
    .eq("repo_id", repoId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (row as GoalRow | null) ?? null;
}

// ── generation path (nightly cron only) ─────────────────────────────────────

type GoalRefreshOutcome = "generated" | "skipped" | "budget_exhausted" | "failed";

/**
 * Nightly per-repo goal metric refresh. Reads the repo's status page,
 * fingerprints it (git blob sha, or the no-status-page marker), and asks the
 * model for a metric only when the repo has no goal yet or the fingerprint
 * changed, and never when the latest goal is manual (manual wins). Appends a
 * new row (set_by 'ai'); a client's typed quantity carries over whenever the
 * metric shape is unchanged.
 */
export async function refreshRepoGoal(
  repo: { id: string; name: string; repo: string },
  budget: GenerationBudget,
): Promise<GoalRefreshOutcome> {
  const row = await latestGoalRow(repo.id);
  const latest = row ? toGoal(row) : null;

  const page = await fetchStatusPage(repo.repo);
  const key = page ? page.sha : NO_STATUS_PAGE;
  const decision = goalRefreshDecision(
    latest ? { source_key: latest.sourceKey, source: latest.source } : null,
    key,
  );
  if (decision === "skip") return "skipped";

  if (!budget.take()) return "budget_exhausted";
  const suggestion = await suggestGoalMetric({
    projectName: repo.name,
    statusHtml: page?.html ?? null,
  });
  if (!suggestion) return "failed";

  const { error } = await htt.from("project_goals").insert({
    repo_id: repo.id,
    metric: suggestion.metric,
    state: suggestion.state,
    unit: suggestion.unit,
    period: suggestion.period,
    quantity: carryQuantity(latest, suggestion),
    source: suggestion.stated ? "stated" : "suggested",
    source_key: key,
    set_by: "ai",
  });
  if (error) {
    console.error(`[htt goals] insert failed for ${repo.repo}: ${error.message}`);
    return "failed";
  }
  return "generated";
}
