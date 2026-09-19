import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";

// Summarize the themes running across recently posted ideas and learnings, for
// the "Trends across ideas" card on the Innovation cockpit. Same never-throws
// contract as the other lib/ai helpers: returns null on any failure (no key, no
// material, or an API error) so callers degrade gracefully.

const MODEL = modelFor("idea-trends", "fast");
const LOOKBACK_DAYS = 60;
const MAX_IDEAS = 80;
const MIN_IDEAS = 3; // fewer than this, there is no trend to find

export type IdeaTrends = { themes: string[]; sourceCount: number; model: string };

export const ideaTrendsOutput = z.object({
  themes: z.array(z.string().describe("One plain sentence naming a theme that runs across MULTIPLE items, ideally saying roughly how many touch it.")),
});

const SCHEMA = jsonSchemaFor(ideaTrendsOutput);

export async function generateIdeaTrends(): Promise<IdeaTrends | null> {
  const anthropic = anthropicIfConfigured();
  if (!anthropic) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await companyOs.from("ideas").select("kind, title, office, takeaway, created_at")
    .neq("status", "archived")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_IDEAS);
  if (error) return null;

  const rows = (data ?? []) as { kind: string | null; title: string | null; office: string | null; takeaway: string | null }[];
  if (rows.length < MIN_IDEAS) return null;

  const material = rows
    .map(
      (r) =>
        `- [${r.kind === "learning" ? "learning" : "idea"}${r.office ? `, ${r.office}` : ""}] ${r.title ?? "Untitled"}` +
        `${r.takeaway ? ` — ${r.takeaway}` : ""}`,
    )
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // 4 one-sentence themes run past 800 tokens and truncate the JSON mid-
      // string, which then fails to parse; 1500 leaves headroom.
      max_tokens: 1500,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            "Below are ideas and learnings the team posted recently. Identify 2-4 themes that run across MULTIPLE items — recurring problems, repeated interests, or patterns worth noticing — and write each as one plain sentence that says roughly how many items touch it. If there is no genuine cross-cutting pattern, return fewer or none. Do not simply restate individual items.\n\n" +
            material,
        },
      ],
    });
    const out = readStructuredOutput("idea-trends", MODEL, response, ideaTrendsOutput);
    if (!out.ok) {
      console.error("idea-trends:", out.error);
      return null;
    }
    const parsed = out.data;
    const themes = (parsed.themes ?? []) as unknown[];
    const clean = themes.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4);
    if (clean.length === 0) return null;
    return { themes: clean, sourceCount: rows.length, model: MODEL };
  } catch {
    return null;
  }
}
