import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { saigonToday } from "@/kernel/config/dates";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyEo, notifyOps, notifyProduct, type LarkMessage } from "@/kernel/messaging/lark";
import { refresh } from "@/entities/boards/lib/card-helpers";
import { draftSprint, type SprintDraft } from "@/entities/boards/lib/sprint-draft";
import { renderSprintNotice, type SprintNoticeBoard } from "@/entities/boards/lib/sprint-notice";
import {
  SPRINT_CHATS,
  nextSprintName,
  planningDayOnOrAfter,
  sprintCovering,
  sprintWeek,
  sprintWindow,
  weeklySprintChat,
  type SprintChat,
} from "@/entities/boards/lib/sprint-cadence";
import { BOARD_SELECT, SPRINT_SELECT, type BoardRow, type SprintRow } from "@/entities/boards/lib/types";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 1 * * 1";

// Vercel cron (see vercel.json): Monday 01:00 UTC (08:00 Asia/Ho_Chi_Minh).
// Weekly sprints (WS-01): on every board that switched them on (Board
// settings), open next week's sprint, Wednesday to Tuesday, named by the
// board's own count with a theme and goal drafted from its open cards; then
// send each board's team chat the sprint planning board (SP-01) with a link
// to each new sprint, so the team spends Monday and Tuesday moving what is
// not done and making the drafted name and goal its own. A board whose sprint
// already covers the week is left alone and named as already planned, so a
// second run in the same week opens nothing twice. The ending sprint is not
// closed here: that is Finish planning on the planning board.
const SEND: Record<SprintChat, (message: LarkMessage) => Promise<boolean>> = {
  product: notifyProduct,
  eo: notifyEo,
  ops: notifyOps,
};
// Named in the failure so the run says what to fix, not just that it broke.
const WEBHOOK_ENV: Record<SprintChat, string> = {
  product: "LARK_PRODUCT_WEBHOOK_URL",
  eo: "LARK_EO_WEBHOOK_URL",
  ops: "LARK_OPS_WEBHOOK_URL",
};

type Flagged = { board: BoardRow; chat: SprintChat };
type OpenCard = { board_id: string; title: string; priority: string };
type DoneCard = { board_id: string; title: string };
const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

const groupBy = <T extends { board_id: string }>(rows: T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.board_id, [...(out.get(r.board_id) ?? []), r]);
  return out;
};

async function handler(_req: Request) {
  const planningDay = planningDayOnOrAfter(saigonToday());
  const window = sprintWindow(planningDay);

  const boardsRes = await companyOs.from("boards").select(BOARD_SELECT).eq("status", "active").is("archived_at", null).order("sort_order");
  if (boardsRes.error) return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  const flagged: Flagged[] = [];
  for (const board of (boardsRes.data ?? []) as BoardRow[]) {
    const chat = weeklySprintChat(board);
    if (chat) flagged.push({ board, chat });
  }
  if (flagged.length === 0) return NextResponse.json({ planningDay, skipped: "no board has weekly sprints switched on" });

  const boardIds = flagged.map((f) => f.board.id);
  // Newest first, so a board's first row is the sprint the new one follows.
  const sprintsRes = await companyOs
    .from("sprints")
    .select(SPRINT_SELECT)
    .in("board_id", boardIds)
    .order("starts_on", { ascending: false, nullsFirst: false });
  if (sprintsRes.error) return NextResponse.json({ error: sprintsRes.error.message }, { status: 500 });
  const sprintsByBoard = groupBy((sprintsRes.data ?? []) as SprintRow[]);
  const previousIds = boardIds.map((id) => sprintsByBoard.get(id)?.[0]?.id).filter(Boolean) as string[];
  const clientIds = [...new Set(flagged.map((f) => f.board.client_company_id).filter(Boolean) as string[])];

  // The draft's raw material and the notice's client names. None of these can
  // stop the sprints from opening: a failure here is logged and the draft or
  // the label goes without.
  const [openRes, doneRes, clientsRes] = await Promise.all([
    companyOs.from("tasks").select("board_id, title, priority").in("board_id", boardIds).eq("status", "open").is("archived_at", null).is("parent_task_id", null),
    previousIds.length
      ? companyOs.from("tasks").select("board_id, title").in("sprint_id", previousIds).eq("status", "done").is("archived_at", null).is("parent_task_id", null)
      : Promise.resolve({ data: [] as DoneCard[], error: null }),
    clientIds.length
      ? selectCompanies("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  for (const [label, res] of [["tasks", openRes], ["tasks", doneRes], ["companies", clientsRes]] as const) {
    if (res.error) console.error(`[weekly-sprints] ${label}`, res.error.message);
  }
  const openByBoard = groupBy((openRes.data ?? []) as OpenCard[]);
  const doneByBoard = groupBy((doneRes.data ?? []) as DoneCard[]);
  const clientName = new Map(((clientsRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const origin = getSiteOrigin();

  // Every board's line in its chat's notice, then the sprints that still need
  // opening. The drafts run together: one model call per board, and the
  // routine should not spend its minute waiting on them in turn.
  const lines = new Map<SprintChat, SprintNoticeBoard[]>();
  const pending: { f: Flagged; line: SprintNoticeBoard; draft: Promise<SprintDraft> }[] = [];
  let covered = 0;
  for (const f of flagged) {
    const { board } = f;
    const own = sprintsByBoard.get(board.id) ?? [];
    const line: SprintNoticeBoard = {
      client: board.client_company_id ? clientName.get(board.client_company_id) ?? null : null,
      board: board.name,
      url: origin ? `${origin}/team/boards/${board.slug}` : null,
      sprintUrl: null,
      created: null,
      covered: null,
      failed: null,
    };
    lines.set(f.chat, [...(lines.get(f.chat) ?? []), line]);
    const existing = sprintCovering(own, window);
    if (existing) {
      line.covered = existing.name;
      covered += 1;
      continue;
    }
    const previous = own[0] ?? null;
    const open = [...(openByBoard.get(board.id) ?? [])].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
    const draft = draftSprint({
      board: board.name,
      description: board.description,
      client: line.client,
      previous: previous ? { name: previous.name, goal: previous.goal } : null,
      open: open.map((c) => ({ title: c.title, priority: c.priority })),
      finished: (doneByBoard.get(board.id) ?? []).map((c) => c.title),
    });
    pending.push({ f, line, draft });
  }

  let created = 0;
  const failed: string[] = [];
  for (const { f, line, draft } of pending) {
    const { board } = f;
    const { theme, goal } = await draft;
    const name = nextSprintName(sprintsByBoard.get(board.id) ?? [], theme);
    const row = { board_id: board.id, name, goal, starts_on: window.startsOn, ends_on: window.endsOn, status: "active", week: sprintWeek(window.startsOn) };
    const { data, error } = await companyOs.from("sprints").insert(row).select("id").single();
    if (error) {
      line.failed = error.message;
      failed.push(`${board.name}: ${error.message}`);
      continue;
    }
    line.created = { name, goal };
    line.sprintUrl = origin ? `${origin}/team/boards/${board.slug}/sprints/${(data as { id: string }).id}` : null;
    created += 1;
    await recordAudit({ table: "sprints", recordId: (data as { id: string }).id, operation: "insert", actor: "weekly-sprints", newData: row });
    refresh(board.slug);
  }

  // One card per chat, in the chats' fixed order. A chat counts as told only
  // when Lark took the card, and an untaken one fails the run naming the
  // variable to set, as the check-in reminder does.
  const posted: SprintChat[] = [];
  const undelivered: string[] = [];
  for (const chat of SPRINT_CHATS) {
    const boards = lines.get(chat.key);
    if (!boards) continue;
    const ok = await SEND[chat.key](renderSprintNotice({ planningDay, ...window, planningUrl: origin ? `${origin}/team/sprint-planning` : null, boards }));
    if (ok) posted.push(chat.key);
    else undelivered.push(`${chat.label} (${WEBHOOK_ENV[chat.key]})`);
  }

  const problems = [
    ...failed.map((f) => `could not open a sprint on ${f}`),
    ...(undelivered.length ? [`Lark did not accept the notice for ${undelivered.join(" and ")}`] : []),
  ];
  const body = { planningDay, startsOn: window.startsOn, endsOn: window.endsOn, created, covered, posted };
  // A 500 is the only thing recordRoutineRun reads as failure, so a sprint
  // that did not open or a chat that heard nothing shows red on Settings → Agents.
  if (problems.length) return NextResponse.json({ ...body, error: problems.join("; ") }, { status: 500 });
  return NextResponse.json(body);
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/weekly-sprints/", req, handler);
