import { generateRaw } from "./summarize";
import { GOAL_PERIODS, composeMetric, type GoalPeriod } from "../goal-grammar";

/**
 * The nightly goal-metric suggestion, ported from the Human Token Tracker
 * (lib/ai/suggest-goal.ts). Given a repo's name and its own status page, the
 * model names the single most business-meaningful countable metric in the goal
 * grammar "[state] [object] per [period]", e.g. won leads per week. If the
 * page explicitly states a goal, the page's words win (stated: true).
 *
 * Called only from the nightly refresh, inside the shared GenerationBudget.
 * Output is strict JSON, so it skips the prose scrub; validation happens in
 * parseGoalSuggestion and a malformed reply just returns null (fail soft,
 * retried the next night).
 */

export interface GoalSuggestion {
  /** Display phrase, "[state] [object]" (e.g. "won leads"). */
  metric: string;
  /** The countable state qualifier ("won"). */
  state: string;
  /** The counted object, plural ("leads"). Stored in the unit column. */
  unit: string;
  period: GoalPeriod;
  /** True when the status page itself names the goal; the page's words win. */
  stated: boolean;
  /** Only when the page explicitly states a numeric target per period. */
  quantity: number | null;
}

const SYSTEM = `You name the one goal a business should track for a software project, as a countable event with an unambiguous completion state and a review period. Output strict JSON only, no prose, no code fences:
{"state": "...", "object": "...", "period": "...", "stated": true|false, "quantity": number|null}

Rules:
- "object" is one or two plain lowercase plural words for the business outcome being counted. Examples: "leads", "applicants", "calculations", "pages".
- "state" is ONE plain lowercase word, usually a past participle, naming the completion state that makes one of them count. Examples: "won" leads, "qualified" applicants, "completed" calculations, "published" pages. Without the state the object is arguable; with it, it is countable.
- Never use measures of effort (hours, tokens, pull requests, commits, deploys) or vague qualities (engagement, satisfaction). The metric must count business outcomes.
- "period" is the natural review rhythm for that metric: "day", "week", "month", or "quarter". Leads suit a week; opportunities suit a month.
- "stated" is true ONLY if the provided status page explicitly names a goal metric. Then use the page's own wording for state and object.
- "quantity" is a number ONLY if the status page explicitly states a numeric target per period; otherwise null. Never invent a quantity.`;

export async function suggestGoalMetric(input: {
  projectName: string;
  statusHtml: string | null;
}): Promise<GoalSuggestion | null> {
  const page = input.statusHtml
    ? `The project's own status page (HTML, read the text content):\n\n${input.statusHtml.slice(0, 60000)}`
    : "This project has no status page. Infer the metric from the project name alone.";
  const text = await generateRaw(SYSTEM, `Project name: ${input.projectName}\n\n${page}`);
  if (!text) return null;
  const parsed = parseGoalSuggestion(text);
  if (!parsed) {
    console.error(`[htt goals] unparseable suggestion for ${input.projectName}: ${text.slice(0, 200)}`);
  }
  return parsed;
}

/** Strict validation of the model's JSON. Exported for tests. */
export function parseGoalSuggestion(text: string): GoalSuggestion | null {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const state = typeof o.state === "string" ? o.state.trim().toLowerCase() : "";
  const object = typeof o.object === "string" ? o.object.trim().toLowerCase() : "";
  const period = o.period as GoalPeriod;
  if (!state || state.length > 30 || /\s/.test(state)) return null;
  if (!object || object.length > 40) return null;
  if (!GOAL_PERIODS.includes(period)) return null;

  const quantity =
    typeof o.quantity === "number" && Number.isFinite(o.quantity) && o.quantity > 0
      ? o.quantity
      : null;

  return {
    metric: composeMetric(state, object),
    state,
    unit: object,
    period,
    stated: o.stated === true,
    quantity,
  };
}
