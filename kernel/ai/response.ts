import type Anthropic from "@anthropic-ai/sdk";
import { recordAiUsage, type AiUsage } from "@/kernel/audit/routine-runs";
import { log } from "@/kernel/config/log";

/**
 * One place where every Anthropic response is turned into text, and the only
 * place token usage is recorded.
 *
 * Two things every call site used to get wrong on its own:
 *
 *  - `stop_reason: "max_tokens"` was never checked. On a structured-output call
 *    that leaves truncated JSON, and the bare `JSON.parse` downstream throws a
 *    SyntaxError that reads like an API outage. It is named here instead, so a
 *    too-small budget is diagnosable from the stored ai_error.
 *  - `usage` was never read anywhere, so no route could be attributed a cost
 *    and prompt-cache hits could not be confirmed. Every call logs one line.
 */

/**
 * Emit one greppable line per model call.
 *
 * `ai-usage` is the grep handle (the `msg` field) in the Vercel runtime logs; `site` is what
 * makes the bill attributable to a feature rather than to the project as a
 * whole. `cache_read` is the number to watch on the agent loops — if it stays
 * at 0 across a multi-turn conversation, a breakpoint is missing or something
 * volatile is invalidating the prefix.
 */
export function logAiUsage(site: string, model: string, usage: AiUsage | null | undefined): void {
  if (!usage) return;
  // Attribute the call to the scheduled routine that is running, if any.
  recordAiUsage(usage);
  log("info", "ai-usage", {
    site,
    model,
    in: usage.input_tokens,
    out: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
  });
}

export type TextOutput = { ok: true; text: string } | { ok: false; error: string };

/**
 * Log usage, then pull the text block out of a response — refusing on the two
 * stop reasons that produce unusable output.
 *
 * Callers map `{ ok: false }` onto whatever their own failure contract is
 * (ai_error, null, a thrown Err); none of them should be parsing content
 * without going through here first.
 */
export function readTextOutput(
  site: string,
  model: string,
  response: Anthropic.Message,
  refusalMessage = "The model declined this request.",
): TextOutput {
  logAiUsage(site, model, response.usage);

  if (response.stop_reason === "refusal") {
    return { ok: false, error: refusalMessage };
  }
  if (response.stop_reason === "max_tokens") {
    return {
      ok: false,
      error:
        `The response hit the max_tokens cap after ${response.usage?.output_tokens ?? "?"} output ` +
        `tokens and was cut off mid-output. Raise max_tokens for this call.`,
    };
  }

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block || !block.text.trim()) return { ok: false, error: "Model returned no text output." };
  return { ok: true, text: block.text };
}
