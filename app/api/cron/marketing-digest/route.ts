import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import { notifyOps } from "@/lib/lark";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
export const fetchCache = "force-no-store";

// Vercel cron (see vercel.json): daily. Reminds the founder of manual-post
// content (blog, LinkedIn, Facebook) that is due today or overdue and not yet
// posted. Email is excluded: it sends itself via the campaign engine. Sends
// nothing when nothing is due.
const FOUNDER_EMAIL = "dave@edge8.ai";
const CALENDAR_URL = "https://www.edge8.ai/admin/revenue/marketing/calendar";
const MANUAL_CHANNELS = ["blog", "linkedin", "facebook"];
const CHANNEL_LABEL: Record<string, string> = {
  blog: "Blog",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

type DueRow = {
  id: string;
  title: string;
  channel: string;
  publish_date: string | null;
  brands: { name: string } | { name: string }[] | null;
};

function brandName(row: DueRow): string {
  const b = Array.isArray(row.brands) ? row.brands[0] : row.brands;
  return b?.name ?? "—";
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await companyOs
    .from("marketing_content")
    .select("id, title, channel, publish_date, brands(name)")
    .in("channel", MANUAL_CHANNELS)
    .lte("publish_date", today)
    .not("status", "in", "(published,skipped)")
    .order("publish_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as DueRow[];
  if (rows.length === 0) {
    return NextResponse.json({ today, due: 0, sent: false });
  }

  const line = (r: DueRow) => {
    const overdue = r.publish_date && r.publish_date < today ? " (overdue)" : "";
    return `<li><strong>${escapeHtml(r.title)}</strong> — ${CHANNEL_LABEL[r.channel] ?? r.channel} · ${escapeHtml(
      brandName(r),
    )} · ${r.publish_date}${overdue}</li>`;
  };

  const html =
    `<p>Content due to be posted by hand (blog, LinkedIn, Facebook):</p>` +
    `<ul>${rows.map(line).join("")}</ul>` +
    `<p>Mark each one posted from the calendar once it's live.</p>` +
    `<p><a href="${CALENDAR_URL}">Open the marketing calendar</a></p>`;

  const emailOk = await sendTransactionalEmail({
    to: FOUNDER_EMAIL,
    subject: `Marketing: ${rows.length} post${rows.length === 1 ? "" : "s"} due`,
    html,
  });

  const larkLines = [
    `📣 Marketing — ${rows.length} post${rows.length === 1 ? "" : "s"} due to publish`,
    ...rows
      .slice(0, 10)
      .map((r) => `• [${CHANNEL_LABEL[r.channel] ?? r.channel}] ${r.title} — ${r.publish_date}`),
    rows.length > 10 ? `…and ${rows.length - 10} more` : "",
    CALENDAR_URL,
  ].filter(Boolean);
  await notifyOps(larkLines.join("\n"));

  return NextResponse.json({ today, due: rows.length, emailSent: emailOk });
}
