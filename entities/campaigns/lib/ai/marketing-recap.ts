import { anthropicIfConfigured } from "@/kernel/ai/client";
import { selectEmailCampaigns } from "../reads";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { readTextOutput } from "@/kernel/ai/response";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";
import { getBroadcastLinkStats, getBroadcastUnsubscribes } from "@/entities/campaigns/lib/broadcast-report";

// The monthly marketing recap: read every broadcast that went out in one
// calendar month, aggregate how they performed, and ask Claude for a plain
// readout plus content suggestions for next month, grounded in which topics
// actually earned opens and clicks. Same never-throws contract as the other
// lib/ai helpers: returns null on any failure (no key, no sends, or an API
// error) so the cron records a clean skip.

const MODEL = modelFor("marketing-recap", "standard");

export type RecapSuggestion = { title: string; rationale: string };
export type RecapMetrics = {
  broadcasts: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
};
export type MarketingRecap = {
  readout: string;
  suggestions: RecapSuggestion[];
  metrics: RecapMetrics;
  model: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readout", "suggestions"],
  properties: {
    readout: {
      type: "string",
      description:
        "2-4 sentences: how the month's email marketing performed and what stands out. Plain, specific, grounded in the numbers given. No fluff.",
    },
    // No maxItems (output_config JSON schemas reject array-length keywords). The
    // 3-5 cap is set in the prompt and enforced by the .slice() below.
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "rationale"],
        properties: {
          title: { type: "string", description: "A content type or topic to produce next month." },
          rationale: { type: "string", description: "One sentence tying it to this month's engagement data." },
        },
      },
    },
  },
} as const;

type SentBroadcast = { id: string; name: string; subject: string; approved_at: string | null };

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

// [start, end) bounds of the calendar month that `month` falls in, in UTC.
export function monthBounds(month: Date): { start: Date; end: Date; periodMonth: string } {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  return { start, end, periodMonth: start.toISOString().slice(0, 10) };
}

export async function generateMarketingRecap(month: Date): Promise<MarketingRecap | null> {
  const anthropic = anthropicIfConfigured();
  if (!anthropic) return null;

  const { start, end } = monthBounds(month);
  const { data, error } = await companyOs.from("email_campaigns").select("id, name, subject, approved_at")
    .eq("status", "sent")
    .gte("sent_at", start.toISOString())
    .lt("sent_at", end.toISOString())
    .order("sent_at", { ascending: true });
  if (error) {
    console.error("marketing-recap: broadcast read failed:", error.message);
    return null;
  }

  const broadcasts = (data ?? []) as SentBroadcast[];
  if (broadcasts.length === 0) return null;

  const metrics: RecapMetrics = { broadcasts: broadcasts.length, sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 };
  const topicPeople = new Map<string, number>();
  const lines: string[] = [];

  for (const b of broadcasts) {
    const [stats, links, unsub] = await Promise.all([
      getBroadcastStats(b.id),
      getBroadcastLinkStats(b.id),
      getBroadcastUnsubscribes(b.id, b.approved_at),
    ]);
    metrics.sent += stats.sent;
    metrics.delivered += stats.delivered;
    metrics.opened += stats.opened;
    metrics.clicked += stats.clicked;
    metrics.unsubscribed += unsub;
    for (const l of links) topicPeople.set(l.content, (topicPeople.get(l.content) ?? 0) + l.people);

    const topics = links
      .slice(0, 3)
      .map((l) => `${l.content} (${l.people})`)
      .join(", ");
    lines.push(
      `- "${b.subject}" — sent ${stats.sent}, opens ${pct(stats.opened, stats.delivered)}, clicks ${pct(stats.clicked, stats.delivered)}, unsub ${unsub}` +
        (topics ? `; top topics: ${topics}` : ""),
    );
  }

  const topTopics = [...topicPeople.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, people]) => `${topic} (${people} people)`)
    .join(", ");

  const material =
    `Month total: ${metrics.broadcasts} broadcasts, ${metrics.sent} sent, ${pct(metrics.opened, metrics.delivered)} open rate, ` +
    `${pct(metrics.clicked, metrics.delivered)} click rate, ${metrics.unsubscribed} unsubscribes.\n\n` +
    `Per broadcast:\n${lines.join("\n")}\n\n` +
    `Topics by total clickers across the month: ${topTopics || "none tagged"}.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            "Below is one month of email marketing performance for Edge8. Write a short readout of how the month went, then propose 3-5 content types or topics to produce next month. Ground every suggestion in what actually earned opens and clicks this month (lean into topics that pulled, and name what to drop or change if something underperformed). Do not invent metrics that are not given.\n\n" +
            material,
        },
      ],
    });
    const out = readTextOutput("marketing-recap", MODEL, response);
    if (!out.ok) {
      console.error("marketing-recap:", out.error);
      return null;
    }
    const parsed = JSON.parse(out.text) as { readout?: unknown; suggestions?: unknown };
    const readout = typeof parsed.readout === "string" ? parsed.readout.trim() : "";
    if (!readout) return null;
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter(
        (s): s is RecapSuggestion =>
          !!s && typeof s === "object" && typeof (s as RecapSuggestion).title === "string" && typeof (s as RecapSuggestion).rationale === "string",
      )
      .slice(0, 5);
    return { readout, suggestions, metrics, model: MODEL };
  } catch {
    return null;
  }
}
