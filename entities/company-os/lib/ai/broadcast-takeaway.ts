import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { readTextOutput } from "@/kernel/ai/response";

// One plain-English takeaway line for a broadcast's settled numbers, posted with
// its per-broadcast Lark summary 72 hours after send. Same never-throws contract
// as the other lib/ai helpers: returns null on any failure (no key or API error)
// so the summary still posts with just the numbers.

const MODEL = modelFor("broadcast-takeaway", "fast");

export type BroadcastTakeawayInput = {
  name: string;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  // Topics that pulled clicks, most-engaged first, from the utm_content tags.
  topTopics: { topic: string; people: number }[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["takeaway"],
  properties: {
    takeaway: {
      type: "string",
      description:
        "One sentence, at most ~25 words, naming the single most useful thing these numbers say (what worked or what underperformed). No preamble, no restating every metric.",
    },
  },
} as const;

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

export async function generateBroadcastTakeaway(input: BroadcastTakeawayInput): Promise<string | null> {
  const anthropic = anthropicIfConfigured();
  if (!anthropic) return null;

  const topics =
    input.topTopics.length > 0
      ? input.topTopics.map((t) => `${t.topic} (${t.people} people)`).join(", ")
      : "no clicks tagged to a topic";

  const material =
    `Broadcast: ${input.name} — subject "${input.subject}"\n` +
    `Sent ${input.sent}, delivered ${input.delivered}, opened ${input.opened} (${pct(input.opened, input.delivered)} of delivered), ` +
    `clicked ${input.clicked} (${pct(input.clicked, input.delivered)} of delivered), unsubscribed ${input.unsubscribed}.\n` +
    `Clicks by topic: ${topics}.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            "These are the settled numbers for one marketing email. In one sentence, say the single most useful takeaway an operator should notice (what worked or what fell flat), grounded in these numbers. Do not just restate every metric.\n\n" +
            material,
        },
      ],
    });
    const out = readTextOutput("broadcast-takeaway", MODEL, response);
    if (!out.ok) {
      console.error("broadcast-takeaway:", out.error);
      return null;
    }
    const parsed = JSON.parse(out.text) as { takeaway?: unknown };
    const takeaway = typeof parsed.takeaway === "string" ? parsed.takeaway.trim() : "";
    return takeaway.length > 0 ? takeaway : null;
  } catch {
    return null;
  }
}
