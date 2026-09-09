import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { notifyMarketing } from "@/kernel/messaging/lark";
import { getAnalyticsOverview, getTrafficCount } from "@/entities/company-os/lib/vercel-analytics";
import { getBroadcastStats } from "@/entities/company-os/modules/campaigns/broadcasts";

// Vercel cron (see vercel.json): weekly, Monday. Posts a plain "Marketing this
// week" pulse to the Marketing Lark channel — public-site traffic with a
// week-over-week line, what shipped (published posts), and the broadcasts that
// went out. Facts only, no AI: the pulse is a heartbeat. The monthly recap is
// where content suggestions live, because a single week is too thin to advise
// on. Always posts, even a quiet week, so its absence would be a real signal.

const DAY_MS = 86_400_000;
const CHANNEL_LABEL: Record<string, string> = { blog: "blog", linkedin: "LinkedIn", facebook: "Facebook", email: "email" };

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

function wow(now: number, prior: number): string {
  if (prior <= 0) return "no prior week";
  const change = Math.round(((now - prior) / prior) * 100);
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "▬";
  return `${arrow} ${Math.abs(change)}% vs last week`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type PostRow = { channel: string };
type SentRow = { id: string; name: string };

async function handler(_req: Request) {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const priorStart = new Date(now.getTime() - 14 * DAY_MS);
  const rangeLabel = `${dayLabel(weekStart)} – ${dayLabel(now)}`;

  // Traffic: this week's overview (totals + top pages + channels) plus a prior
  // week count for the WoW line. Each degrades independently.
  const [overview, priorTraffic] = await Promise.all([
    getAnalyticsOverview("7d", "public"),
    getTrafficCount(priorStart.toISOString(), weekStart.toISOString(), "public"),
  ]);

  const trafficLines: string[] = [];
  if ("error" in overview) {
    trafficLines.push("Traffic · public site (7d): unavailable");
  } else {
    const { totals, topPages, byChannel } = overview;
    const wowLine = priorTraffic ? ` (${wow(totals.pageviews, priorTraffic.pageviews)})` : "";
    trafficLines.push("Traffic · public site (7d)");
    trafficLines.push(`Page views ${totals.pageviews.toLocaleString()}${wowLine} · Visitors ${totals.visitors.toLocaleString()}`);
    if (topPages.length > 0) {
      trafficLines.push("Top pages: " + topPages.slice(0, 3).map((p) => `${p.label} (${p.pageviews.toLocaleString()})`).join(" · "));
    }
    if (byChannel.length > 0) {
      trafficLines.push("Channels: " + byChannel.slice(0, 4).map((c) => `${c.label} ${c.value.toLocaleString()}`).join(" · "));
    }
  }

  // Shipped: content published this week (email ships as a broadcast, counted
  // below, so it is excluded here) and the broadcasts that went out.
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const [{ data: posts, error: postsError }, { data: sent, error: sentError }] = await Promise.all([
    companyOs
      .from("marketing_content")
      .select("channel")
      .eq("status", "published")
      .neq("channel", "email")
      .gte("publish_date", weekStartDate),
    companyOs
      .from("email_campaigns")
      .select("id, name")
      .eq("status", "sent")
      .gte("sent_at", weekStart.toISOString())
      .order("sent_at", { ascending: true }),
  ]);
  if (postsError) console.error("[marketing-weekly-pulse] posts read:", postsError.message);
  if (sentError) console.error("[marketing-weekly-pulse] broadcasts read:", sentError.message);

  const postRows = (posts ?? []) as PostRow[];
  const byChannelCount = new Map<string, number>();
  for (const p of postRows) byChannelCount.set(p.channel, (byChannelCount.get(p.channel) ?? 0) + 1);
  const postBreakdown = [...byChannelCount.entries()].map(([c, n]) => `${n} ${CHANNEL_LABEL[c] ?? c}`).join(", ");

  const sentRows = (sent ?? []) as SentRow[];
  const emailLines: string[] = [];
  for (const b of sentRows) {
    const stats = await getBroadcastStats(b.id);
    emailLines.push(
      `• ${b.name} (${stats.sent} sent · Open ${pct(stats.opened, stats.delivered)} · Click ${pct(stats.clicked, stats.delivered)})`,
    );
  }

  const lines = [
    `📣 Marketing this week — ${rangeLabel}`,
    "",
    ...trafficLines,
    "",
    "Shipped this week",
    `Posts: ${postRows.length} published${postBreakdown ? ` (${postBreakdown})` : ""}`,
    sentRows.length === 0 ? "Emails: none sent" : `Emails: ${sentRows.length} broadcast${sentRows.length === 1 ? "" : "s"}`,
    ...emailLines,
    "",
    "https://www.edge8.ai/admin/revenue/marketing",
  ];
  await notifyMarketing(lines.join("\n"));

  return NextResponse.json({
    range: rangeLabel,
    pageviews: "error" in overview ? null : overview.totals.pageviews,
    postsPublished: postRows.length,
    broadcastsSent: sentRows.length,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/marketing-weekly-pulse/", req, handler);
