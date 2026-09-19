import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { z } from "zod/v4";

// One model call per step, one way to make it. Every step runs on the frontier
// tier at high effort with a structured-output schema, and reads the reply
// through readStructuredOutput so the tokens land on the routine_runs row the
// cron opened and the reply is checked against the schema it was asked for.
// The step hands over one Zod schema: this generates the json_schema from it
// and validates the reply through it, so the two cannot drift (ADR 0006).
//
// The budget is well above the copy (a 2,500-word post is about 4k tokens; on
// Fable, max_tokens also covers thinking), and the request gets its own timeout
// because the shared client default was sized for Sonnet.

export const WRITER_MODEL = modelFor("brand-writer", "frontier");
const MAX_TOKENS = 32_000;
const TIMEOUT_MS = 600_000;

export type ModelResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Each step's schema is a module-level const, so the derived json_schema is
// derived once per step rather than once per call.
const wireSchemas = new WeakMap<object, Record<string, unknown>>();
function wireSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const cached = wireSchemas.get(schema);
  if (cached) return cached;
  const derived = jsonSchemaFor(schema);
  wireSchemas.set(schema, derived);
  return derived;
}

export async function callWriterModel<S extends z.ZodType>(input: {
  step: string;
  system: string;
  user: string;
  schema: S;
}): Promise<ModelResult<z.infer<S>>> {
  const llm = anthropicIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await llm.messages.create(
      {
        model: WRITER_MODEL,
        max_tokens: MAX_TOKENS,
        system: input.system,
        output_config: { effort: "high", format: { type: "json_schema", schema: wireSchemaFor(input.schema) } },
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: TIMEOUT_MS },
    );
    return readStructuredOutput(
      `writer-${input.step}`,
      WRITER_MODEL,
      response,
      input.schema,
      `The model declined the ${input.step} step.`,
    );
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
