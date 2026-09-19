// The actionable summary of a group coaching session (the weekly cohort
// call), written for the two audiences inside Edge8 who act on it: the
// engineers who were coached and the leaders who run the programme. It is the
// app-side twin of scripts/crm/meeting-summarize.mjs, on the shared Anthropic
// client and model registry instead of OpenRouter, so the cron needs no extra
// key. Deliberately NOT the 1-1 summariser in ./ai (coach-voiced, two tiers,
// commitments) and NOT the client-facing meeting summary in the portal.
import { z } from "zod/v4";
import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { clip } from "./ai-context";

export const GROUP_SUMMARY_SITE = "coaching-group-summary";

// A two-hour session is about 60k characters; the cap keeps a runaway
// recording from blowing the context, and the tail is what goes.
const MAX_TRANSCRIPT_CHARS = 150_000;

export const groupSummaryOutput = z.object({
  title: z.string().describe("Short and specific, at most eight words, no date and no filler."),
  attendees: z.array(z.string()).describe("Names of the people who spoke or were clearly present. Names only."),
  summary_markdown: z.string().describe(
    "Markdown with ## sections in this order, a section omitted only when empty: 'TL;DR' (one or two sentences); " +
      "'Decisions' (bullets of what was decided or agreed); 'Blockers' (bullets as 'Person: what is blocking them'); " +
      "'For engineers' (concrete next steps and the coaching advice given); " +
      "'For leaders' (themes, risks, anything a leader has to act on or escalate).",
  ),
  action_items: z.array(
    z.object({
      title: z.string().describe("The task in a few words, imperative."),
      owner: z.string().describe("The person responsible as named in the transcript, or 'Unassigned'."),
      detail: z.string().describe("One sentence of context, or an empty string."),
      due_date: z.string().describe("YYYY-MM-DD if a deadline was stated; omit otherwise.").optional(),
    }),
  ).describe("Concrete follow-ups stated or clearly implied. Empty array if none; never manufacture items to fill the list."),
});

export type GroupSummary = z.infer<typeof groupSummaryOutput>;

const GROUP_SUMMARY_SCHEMA = jsonSchemaFor(groupSummaryOutput);

export const GROUP_SUMMARY_SYSTEM =
  "You are an assistant for Edge8, an AI enablement company that coaches client engineers and leaders. " +
  "You turn a raw group coaching-session transcript into an internal, actionable summary. Two audiences read it: " +
  "the engineers who were coached (they need clear next steps) and the leaders who run the programme (they need " +
  "decisions, blockers and escalations). Work only from the transcript. Never invent decisions, action items, " +
  "owners, figures or advice that was not said; if something is unclear, leave it out rather than guessing. " +
  "Speech-to-text garbles product and tool names, so normalise obvious ones to the real name. Never use em dashes; " +
  "use commas, colons, periods or parentheses (Edge8 brand rule).";

export type GroupSummaryResult = { ok: true; summary: GroupSummary; model: string } | { ok: false; error: string };

/** One model call over the transcript. Never throws: the caller stores the transcript either way. */
export async function summarizeGroupSession(transcript: string): Promise<GroupSummaryResult> {
  const anthropic = anthropicIfConfigured();
  if (!anthropic) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const text = clip(transcript, MAX_TRANSCRIPT_CHARS);
  if (!text.trim()) return { ok: false, error: "Transcript is empty." };
  const model = modelFor(GROUP_SUMMARY_SITE, "standard");
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: GROUP_SUMMARY_SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: GROUP_SUMMARY_SCHEMA } },
      messages: [{ role: "user", content: `Coaching session transcript:\n\n${text}` }],
    });
    const out = readStructuredOutput(GROUP_SUMMARY_SITE, model, response, groupSummaryOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    if (!out.data.summary_markdown.trim()) return { ok: false, error: "Model output was missing the summary." };
    return { ok: true, summary: out.data, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
