import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyMarketing } from "@/kernel/messaging/lark";
import { escapeHtml } from "@/kernel/config/html";
import { generateMarketingRecap, monthBounds } from "@/entities/company-os/lib/ai/marketing-recap";

// Vercel cron (see vercel.json): monthly, on the 4th. Recaps the PRIOR calendar
// month's email marketing and asks Claude for content suggestions, then stores
// the recap, posts it to the Marketing Lark channel, and emails the founder.
// Runs on the 4th (not the 1st) so every broadcast in the month is past its 72h
// settle window before it is graded. Skips cleanly when the month had no sends.
const FOUNDER_EMAIL = "dave@edge8.ai";
const RECAPS_URL = "https://www.edge8.ai/admin/revenue/marketing/recaps";

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

function monthLabel(periodMonth: string): string {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function handler(_req: Request) {
  const now = new Date();
  const priorMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const { periodMonth } = monthBounds(priorMonth);
  const label = monthLabel(periodMonth);

  const recap = await generateMarketingRecap(priorMonth);
  if (!recap) {
    return NextResponse.json({ periodMonth, skipped: "no broadcasts to recap or AI unavailable" });
  }

  // Store first (upsert on period_month) so the record exists even if delivery
  // fails; company_os has no delete grant, so a re-run replaces in place.
  const { error: storeError } = await companyOs
    .from("marketing_recaps")
    .upsert(
      {
        period_month: periodMonth,
        readout: recap.readout,
        suggestions: recap.suggestions,
        metrics: recap.metrics,
        model: recap.model,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "period_month" },
    );
  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 });
  }

  const m = recap.metrics;
  const headline = `${m.broadcasts} broadcast${m.broadcasts === 1 ? "" : "s"} · ${m.sent} sent · Open ${pct(m.opened, m.delivered)} · Click ${pct(m.clicked, m.delivered)} · Unsub ${m.unsubscribed}`;

  // Lark (Marketing channel).
  const larkLines = [
    `🗓️ Marketing recap — ${label}`,
    headline,
    "",
    recap.readout,
    "",
    "Produce next:",
    ...recap.suggestions.map((s) => `• ${s.title} — ${s.rationale}`),
    "",
    RECAPS_URL,
  ];
  await notifyMarketing(larkLines.join("\n"));

  // Email (founder).
  const html =
    `<p><strong>${escapeHtml(label)}</strong> — ${escapeHtml(headline)}</p>` +
    `<p>${escapeHtml(recap.readout)}</p>` +
    `<p><strong>Produce next:</strong></p>` +
    `<ul>${recap.suggestions
      .map((s) => `<li><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.rationale)}</li>`)
      .join("")}</ul>` +
    `<p><a href="${RECAPS_URL}">See past recaps</a></p>`;
  const emailOk = await sendTransactionalEmail({
    to: FOUNDER_EMAIL,
    subject: `Marketing recap: ${label}`,
    html,
  });

  return NextResponse.json({ periodMonth, broadcasts: m.broadcasts, suggestions: recap.suggestions.length, emailSent: emailOk });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/marketing-recap/", req, handler);
