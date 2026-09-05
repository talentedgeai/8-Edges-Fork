import { STYLE_CONTRACT, stripAiTells } from "./style";
import { readTextOutput } from "@/kernel/ai/response";
import { anthropic } from "@/kernel/ai/client";
import { modelFor, openRouterSlug } from "@/kernel/ai/models";

/**
 * Server-only model calls for the two repo summaries. Ported from the Human
 * Token Tracker (lib/ai/summarize.ts); the OpenRouter attribution headers are
 * re-pointed from human-tokens.com to edge8.ai. The model is only invoked by
 * the nightly refresh and the explicit regenerate paths; page views never
 * reach this file.
 *
 * Provider is an explicit switch, not a key-prefix sniff:
 * - AI_PROVIDER=openrouter  goes to OpenRouter (OpenAI-style API), authenticated
 *   with OPENROUTER_API_KEY (falling back to ANTHROPIC_API_KEY for deployments
 *   that still keep the sk-or- key there).
 * - anything else           goes to the Anthropic API via the shared client.
 *
 * Behaviour change (2026-09): an sk-or- key in ANTHROPIC_API_KEY no longer
 * selects OpenRouter on its own. A deployment relying on that must set
 * AI_PROVIDER=openrouter, or the calls go to api.anthropic.com and fail auth.
 *
 * Same Claude model either way; only the route differs. Fail-soft: any error
 * logs loudly and returns null, and the caller records a "failed" outcome.
 */

const ANTHROPIC_MODEL = modelFor("htt-summarize", "fast");
const OPENROUTER_MODEL = openRouterSlug(ANTHROPIC_MODEL);
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type Provider = "anthropic" | "openrouter";

/** The configured provider; anything other than an explicit opt-in is Anthropic. */
export function pickProvider(env: Record<string, string | undefined> = process.env): Provider {
  return env.AI_PROVIDER?.trim().toLowerCase() === "openrouter" ? "openrouter" : "anthropic";
}

export function summaryModel(): string {
  return pickProvider() === "openrouter" ? OPENROUTER_MODEL : ANTHROPIC_MODEL;
}

/**
 * Same provider plumbing as the summaries, minus the prose scrub: for callers
 * that expect strict JSON, where stripAiTells could touch string values.
 */
export async function generateRaw(system: string, userContent: string): Promise<string | null> {
  return generate(system, userContent, { scrub: false });
}

async function generate(
  system: string,
  userContent: string,
  opts: { scrub: boolean } = { scrub: true },
): Promise<string | null> {
  const provider = pickProvider();
  const key =
    provider === "openrouter"
      ? process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn(
      `[htt summaries] ${provider === "openrouter" ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY"} is not set; generation skipped`,
    );
    return null;
  }
  // The style contract governs prose; a strict-JSON caller skips it along with
  // the scrub.
  const fullSystem = opts.scrub ? `${system}\n\n${STYLE_CONTRACT}` : system;
  try {
    const text =
      provider === "openrouter"
        ? await generateViaOpenRouter(key, fullSystem, userContent)
        : await generateViaAnthropic(fullSystem, userContent);
    if (!text) return null;
    return opts.scrub ? stripAiTells(text) : text;
  } catch (e) {
    // Fail soft for the caller, loud for the logs: the cause must be visible.
    const err = e as { status?: number; message?: string };
    console.error(
      `[htt summaries] generation failed: status=${err.status ?? "?"} ${err.message ?? e}`,
    );
    return null;
  }
}

async function generateViaAnthropic(system: string, userContent: string): Promise<string | null> {
  const client = anthropic();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    // Short outputs by prompt; headroom so the text is never truncated.
    // (Haiku 4.5 does not support adaptive thinking — no thinking param.)
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const out = readTextOutput("htt-summarize", ANTHROPIC_MODEL, response);
  if (!out.ok) {
    console.error(`[htt summaries] ${out.error} (stop_reason=${response.stop_reason})`);
    return null;
  }
  return out.text;
}

async function generateViaOpenRouter(
  key: string,
  system: string,
  userContent: string,
): Promise<string | null> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Attribution headers OpenRouter asks apps to send.
      "HTTP-Referer": "https://www.edge8.ai",
      "X-Title": "Edge8 AI Programs",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[htt summaries] openrouter failed: status=${res.status} ${body.slice(0, 300)}`);
    return null;
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    console.error("[htt summaries] openrouter returned no message content");
    return null;
  }
  return text;
}

/**
 * The executive summary: what this repo's program is about, condensed from the
 * repo's own docs/project-status.html. The curated story, in prose.
 */
export async function summarizeStatusPage(statusHtml: string): Promise<string | null> {
  return generate(
    `You condense a software project's status page into an executive summary for the client who is paying for the work. One paragraph, three to five sentences. Say what the project is, what it does for the business, and where it stands. Write from the page's content only.`,
    `Here is the project's status page (HTML, read the text content):\n\n${statusHtml.slice(0, 60000)}`,
  );
}

/**
 * The latest-PR digest: what changed lately, in a few plain lines. Derived
 * from the raw PR record (titles, authors, dates, state).
 */
export async function summarizeLatestPrs(
  prs: { title: string; author: string; state: string; date: string }[],
): Promise<string | null> {
  const lines = prs.map((p) => `${p.date} [${p.state}] ${p.title} (${p.author})`).join("\n");
  return generate(
    `You summarize a software project's recent pull requests for the client who is paying for the work. Two to four sentences of prose describing what changed lately, grouped by theme when the titles allow it. Name concrete features and fixes from the titles; translate developer shorthand into plain words. Do not list the pull requests one by one.`,
    `The most recent pull requests, newest first:\n\n${lines}`,
  );
}
