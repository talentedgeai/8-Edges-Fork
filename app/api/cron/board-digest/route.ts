import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import { getSiteOrigin } from "@/lib/site-origin";
import { one } from "@/lib/embedded";
import { escapeHtml } from "@/lib/html";
import { PALETTE } from "@/lib/design/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
export const fetchCache = "force-no-store";

// Vercel cron (see vercel.json): daily 01:15 UTC (08:15 Asia/Ho_Chi_Minh).
// Emails each active team member a summary of their open board cards, grouped by
// board, oldest-due first, overdue flagged. Skips anyone with nothing assigned.
type BoardEmbed = { name: string | null; slug: string | null; status: string | null; archived_at: string | null };
type PersonEmbed = {
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  display_name: string | null;
};
type Row = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  assignee_id: string | null;
  boards: BoardEmbed | BoardEmbed[] | null;
  people: PersonEmbed | PersonEmbed[] | null;
};

const personName = (p: PersonEmbed): string => p.preferred_name || p.display_name || p.full_name || p.email;
function fmtDue(iso: string | null): string {
  if (!iso) return "no due date";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type Card = { title: string; board: string; slug: string; due: string | null; overdue: boolean };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await companyOs
    .from("tasks")
    .select(
      "id, title, due_date, priority, assignee_id, " +
        "boards:boards!board_id(name, slug, status, archived_at), " +
        "people:people!assignee_id(email, full_name, preferred_name, display_name)",
    )
    .neq("status", "done")
    .is("archived_at", null)
    .is("parent_task_id", null)
    .not("assignee_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only email people who are active team members.
  const rows = (data ?? []) as unknown as Row[];
  const assigneeIds = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean) as string[])];
  const activeIds = new Set<string>();
  if (assigneeIds.length) {
    const { data: tms } = await companyOs
      .from("team_members")
      .select("person_id")
      .in("person_id", assigneeIds)
      .eq("status", "active");
    for (const t of (tms ?? []) as { person_id: string }[]) activeIds.add(t.person_id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const byPerson = new Map<string, { name: string; email: string; cards: Card[] }>();
  for (const r of rows) {
    const b = one(r.boards);
    const p = one(r.people);
    if (!b || !b.slug || b.status !== "active" || b.archived_at) continue;
    if (!p || !r.assignee_id || !activeIds.has(r.assignee_id)) continue;
    const entry = byPerson.get(r.assignee_id) ?? { name: personName(p), email: p.email, cards: [] };
    entry.cards.push({
      title: r.title,
      board: b.name ?? "Board",
      slug: b.slug,
      due: r.due_date,
      overdue: r.due_date != null && r.due_date < today,
    });
    byPerson.set(r.assignee_id, entry);
  }

  const origin = getSiteOrigin();
  let emailed = 0;
  for (const person of byPerson.values()) {
    person.cards.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
    const n = person.cards.length;
    const items = person.cards
      .map((c) => {
        const due = c.overdue
          ? `<span style="color:${PALETTE.errInk};font-weight:600">${escapeHtml(fmtDue(c.due))} (overdue)</span>`
          : `<span style="color:${PALETTE.inkBody}">${escapeHtml(fmtDue(c.due))}</span>`;
        return `<li style="margin:0 0 8px"><a href="${origin}/team/boards/${escapeHtml(c.slug)}" style="color:${PALETTE.blue};text-decoration:none;font-weight:600">${escapeHtml(
          c.title,
        )}</a><br><span style="font-size:13px;color:${PALETTE.inkBody}">${escapeHtml(c.board)} · </span>${due}</li>`;
      })
      .join("");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:${PALETTE.dark}">
      <p style="font-size:16px">Morning ${escapeHtml(person.name)},</p>
      <p style="font-size:15px;color:${PALETTE.greyMid}">You have ${n} open task${n === 1 ? "" : "s"} across your boards:</p>
      <ul style="padding-left:18px;font-size:15px">${items}</ul>
      <p style="font-size:14px"><a href="${origin}/team/my-work-boards" style="color:${PALETTE.blue}">Open My Work Boards →</a></p>
    </div>`;
    const ok = await sendTransactionalEmail({
      to: person.email,
      subject: `Your Edge8 boards: ${n} open task${n === 1 ? "" : "s"}`,
      html,
      logMeta: { kind: "board-digest", count: n },
    });
    if (ok) emailed++;
  }

  return NextResponse.json({ recipients: byPerson.size, emailed });
}
