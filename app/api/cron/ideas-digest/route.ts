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

// Vercel cron (see vercel.json): daily 01:00 UTC (08:00 Asia/Ho_Chi_Minh).
// Emails the founder and pings Lark ops with everything the team submitted to
// the innovation backlog in the last 24h — build ideas and learnings. Sends
// nothing when the window is empty. A rolling 24h window matched to a
// once-daily run needs no "already notified" state to track.
const FOUNDER_EMAIL = "dave@edge8.ai";
const WINDOW_HOURS = 24;
const BACKLOG_URL = "https://www.edge8.ai/admin/innovation/ideas";

type DigestRow = {
  id: string;
  kind: string;
  title: string;
  office: string | null;
  takeaway: string | null;
  created_at: string;
  people: { full_name: string | null; preferred_name: string | null; email: string } | null;
};

function submitter(row: DigestRow): string {
  const p = Array.isArray(row.people) ? row.people[0] : row.people;
  return p?.preferred_name || p?.full_name || p?.email || "Someone";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await companyOs
    .from("ideas")
    .select(
      "id, kind, title, office, takeaway, created_at, people:people!person_id(full_name, preferred_name, email)",
    )
    .gte("created_at", since)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as DigestRow[];
  if (rows.length === 0) {
    return NextResponse.json({ since, ideas: 0, learnings: 0, sent: false });
  }

  const builds = rows.filter((r) => r.kind !== "learning");
  const learnings = rows.filter((r) => r.kind === "learning");

  const listHtml = (items: DigestRow[]) =>
    `<ul>${items
      .map(
        (r) =>
          `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(submitter(r))}` +
          `${r.takeaway ? `<br/><span style="color:#666">${escapeHtml(r.takeaway)}</span>` : ""}</li>`,
      )
      .join("")}</ul>`;

  const html =
    `<p>New in the innovation backlog in the last 24 hours:</p>` +
    (builds.length ? `<h3>Build ideas (${builds.length})</h3>${listHtml(builds)}` : "") +
    (learnings.length ? `<h3>Learnings (${learnings.length})</h3>${listHtml(learnings)}` : "") +
    `<p><a href="${BACKLOG_URL}">Open the idea backlog</a></p>`;

  const subject = `Innovation backlog: ${plural(builds.length, "idea")}, ${plural(
    learnings.length,
    "learning",
  )} today`;

  const emailOk = await sendTransactionalEmail({ to: FOUNDER_EMAIL, subject, html });

  const larkLines = [
    `💡 Innovation backlog — last 24h`,
    `Build ideas: ${builds.length} · Learnings: ${learnings.length}`,
    ...rows
      .slice(0, 10)
      .map((r) => `• [${r.kind === "learning" ? "Learning" : "Idea"}] ${r.title} — ${submitter(r)}`),
    rows.length > 10 ? `…and ${rows.length - 10} more` : "",
    BACKLOG_URL,
  ].filter(Boolean);
  await notifyOps(larkLines.join("\n"));

  return NextResponse.json({
    since,
    ideas: builds.length,
    learnings: learnings.length,
    emailSent: emailOk,
  });
}
