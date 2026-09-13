import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { readTextOutput } from "@/kernel/ai/response";

// One model call per step, one way to make it. Every step runs on the frontier
// tier at high effort with a structured-output schema, and reads the reply
// through readTextOutput so the tokens land on the routine_runs row the cron
// opened. The budget is well above the copy (a 2,500-word post is about 4k
// tokens; on Fable, max_tokens also covers thinking), and the request gets its
// own timeout because the shared client default was sized for Sonnet.

export const WRITER_MODEL = modelFor("brand-writer", "frontier");
const MAX_TOKENS = 32_000;
const TIMEOUT_MS = 600_000;

export type ModelResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callWriterModel<T>(input: {
  step: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
}): Promise<ModelResult<T>> {
  const llm = anthropicIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await llm.messages.create(
      {
        model: WRITER_MODEL,
        max_tokens: MAX_TOKENS,
        system: input.system,
        output_config: { effort: "high", format: { type: "json_schema", schema: input.schema } },
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: TIMEOUT_MS },
    );
    const out = readTextOutput(`writer-${input.step}`, WRITER_MODEL, response, `The model declined the ${input.step} step.`);
    if (!out.ok) return out;
    try {
      return { ok: true, data: JSON.parse(out.text) as T };
    } catch {
      return { ok: false, error: `The ${input.step} step returned malformed JSON.` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// The brand facts every step's system prompt opens with. Each step appends the
// lens it applies; nothing about the copy is decided here.
export function brandPreamble(p: {
  brandName: string;
  positioning: string | null;
  audience: string | null;
  offer: string | null;
  primaryCta: string | null;
  authorMd: string | null;
  voiceMd: string | null;
  rulesMd: string | null;
}): string {
  const s = (v: string | null) => v ?? "(not set)";
  return `# Brand: ${p.brandName}

## Positioning
${s(p.positioning)}

## Audience
${s(p.audience)}

## What we sell
${s(p.offer)}

## Default call to action
${s(p.primaryCta)}

## Author and credentials
${s(p.authorMd)}

## Voice
${s(p.voiceMd)}

## Hard rules (never break these)
${s(p.rulesMd)}

## House rules (hold for every brand)
- Write the brand name exactly as given above. Never all caps.
- Never use an em dash anywhere. Use a comma, colon, period or parentheses.
- No audit, staffing, hiring or recruiting language, and no pitch for any of them. The post is the product.
- Do not invent facts, numbers, quotes or sources. Everything factual comes from the source material.
- Return through the provided schema only.`;
}
