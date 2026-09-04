import { NextResponse } from "next/server";
import { getProbationRows } from "@/lib/admin/probation";
import { sendTransactionalEmail } from "@/lib/email";
import { saigonToday } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): daily 07:00 UTC. Emails the manager (and the
// founder) exactly when a probation lands 14 days out, so the review happens
// before it ends. Firing on the exact-day match means one nudge per person and
// no "already notified" state to track. Auth is the standard Vercel Cron bearer.
const REVIEW_LEAD_DAYS = 14;
const FOUNDER_EMAIL = "dave@edge8.ai";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = saigonToday();
  const rows = await getProbationRows(today);
  const due = rows.filter((r) => r.daysLeft === REVIEW_LEAD_DAYS);

  let sent = 0;
  for (const r of due) {
    const recipients = [...new Set([r.managerEmail, FOUNDER_EMAIL].filter((e): e is string => !!e))];
    const link = `https://www.edge8.ai/admin/talent/team/${r.teamMemberId}`;
    const ok = await sendTransactionalEmail({
      to: recipients,
      subject: `Probation review due in 2 weeks: ${r.name}`,
      html:
        `<p>${r.name}${r.position ? ` (${r.position})` : ""} finishes probation on ` +
        `<strong>${r.endsOn}</strong> — about two weeks from now.</p>` +
        `<p>Please complete their probation review before then: confirm, extend, or end.</p>` +
        `<p><a href="${link}">Open ${r.name}'s profile</a></p>`,
    });
    if (ok) sent += 1;
  }

  return NextResponse.json({ date: today, dueForReview: due.length, emailsSent: sent });
}
