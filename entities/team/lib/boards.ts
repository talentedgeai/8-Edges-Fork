// A team member's boards and cross-board task list. Scope source:
// company_os.board_members for THIS actor's person id, plus active
// staff_assignments (an assignment to a board's client company is implicit
// membership — see lib/boards/access.ts). Admins see every board.
// Every read is filtered to the actor server-side, never from a passed id —
// getBoardForActor returning null IS the authorization for /team/boards/[slug].

import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import {
  isBoardMember,
  getBoardBySlug,
  STAGE_WON,
  STAGE_NEUTRAL,
  STAGE_LEAD,
  STAGE_PROPOSAL,
  STAGE_DISCOVERY,
  STAGE_CONTRACT,
  type BoardDetail,
  type TaskPriority,
  type TaskStatus,
} from "@/entities/company-os";

export type MyWorkCard = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  boardId: string;
  // The lane the card sits in: its column's name, shared across boards.
  columnId: string;
};

export type MyWorkBoardEntry = {
  slug: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  // Column name -> column id on this board, for landing a lane drop.
  columns: Record<string, string>;
};

export type MyWorkBoard = {
  lanes: { name: string; isDone: boolean; accent: string }[];
  clients: { id: string; name: string }[];
  boards: Record<string, MyWorkBoardEntry>;
  cards: MyWorkCard[];
};

// How long a finished card stays on the Done lane before it drops off the
// member's board. Long enough to feel the week's progress, short enough that
// the lane never becomes an archive.
const DONE_VISIBLE_DAYS = 14;

// Everything assigned to the actor across every active board, as one board.
// Every board seeds the same columns, so a lane is a column name and the
// lanes are the names in column order; a board that renamed a column simply
// contributes its own lane. Cards on boards the actor can no longer see
// (archived, closed) are dropped with the board.
export async function getMyWorkBoard(actor: TeamActor): Promise<MyWorkBoard> {
  const empty: MyWorkBoard = { lanes: [], clients: [], boards: {}, cards: [] };
  const { data: taskData, error: taskErr } = await companyOs
    .from("tasks")
    .select("id, title, priority, status, due_date, board_id, board_column_id, completed_at")
    .eq("assignee_id", actor.personId)
    .not("board_id", "is", null)
    .is("parent_task_id", null)
    .is("archived_at", null)
    .order("position");
  if (taskErr) {
    console.error("getMyWorkBoard: tasks fetch failed:", taskErr.message);
    return empty;
  }
  const doneCutoff = new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  const rows = ((taskData ?? []) as {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    due_date: string | null;
    board_id: string;
    board_column_id: string | null;
    completed_at: string | null;
  }[]).filter((r) => r.status !== "done" || (r.completed_at ?? "") >= doneCutoff);
  if (rows.length === 0) return empty;

  const boardIds = [...new Set(rows.map((r) => r.board_id))];
  const [boardsRes, colsRes] = await Promise.all([
    companyOs
      .from("boards")
      .select("id, slug, name, client_company_id")
      .in("id", boardIds)
      .eq("status", "active")
      .is("archived_at", null),
    companyOs.from("board_columns").select("id, board_id, name, position, is_done").in("board_id", boardIds).order("position"),
  ]);
  if (boardsRes.error) {
    console.error("getMyWorkBoard: boards fetch failed:", boardsRes.error.message);
    return empty;
  }
  if (colsRes.error) {
    console.error("getMyWorkBoard: columns fetch failed:", colsRes.error.message);
    return empty;
  }
  const boardRows = (boardsRes.data ?? []) as { id: string; slug: string; name: string; client_company_id: string | null }[];
  const colRows = (colsRes.data ?? []) as { id: string; board_id: string; name: string; position: number; is_done: boolean }[];

  const clientIds = [...new Set(boardRows.map((b) => b.client_company_id).filter(Boolean) as string[])];
  const clientName = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: companies, error } = await companyOs.from("companies").select("id, name").in("id", clientIds);
    if (error) console.error("getMyWorkBoard: companies fetch failed:", error.message);
    for (const c of (companies ?? []) as { id: string; name: string }[]) clientName.set(c.id, c.name);
  }

  const boards: Record<string, MyWorkBoardEntry> = {};
  for (const b of boardRows) {
    boards[b.id] = {
      slug: b.slug,
      name: b.name,
      clientId: b.client_company_id,
      clientName: b.client_company_id ? clientName.get(b.client_company_id) ?? null : null,
      columns: {},
    };
  }
  // Lanes in column order, deduped by name; the first board to name a lane
  // fixes its position. A lane is "done" when every column of that name is.
  const laneOrder: string[] = [];
  const laneDone = new Map<string, boolean>();
  const colById = new Map<string, { board_id: string; name: string }>();
  for (const c of colRows) {
    if (!boards[c.board_id]) continue;
    boards[c.board_id].columns[c.name] = c.id;
    colById.set(c.id, c);
    if (!laneDone.has(c.name)) {
      laneOrder.push(c.name);
      laneDone.set(c.name, c.is_done);
    } else if (!c.is_done) laneDone.set(c.name, false);
  }
  const nondone = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];
  let nd = 0;
  const lanes = laneOrder.map((name) => {
    const isDone = laneDone.get(name) ?? false;
    return { name, isDone, accent: isDone ? STAGE_WON : nondone[nd++ % nondone.length] };
  });

  const cards: MyWorkCard[] = rows
    .filter((r) => boards[r.board_id] && r.board_column_id && colById.has(r.board_column_id))
    .map((r) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      status: r.status,
      dueDate: r.due_date,
      boardId: r.board_id,
      columnId: colById.get(r.board_column_id as string)!.name,
    }));

  const clients = [...clientName.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { lanes, clients, boards, cards };
}


// Whether the actor may write to a board (member or admin). Read-side helper
// for UI gating; the write actions re-check via boardActorFor.
export async function isBoardMemberForActor(actor: TeamActor, boardId: string): Promise<boolean> {
  if (actor.isAdmin) return true;
  return isBoardMember(boardId, actor.personId, actor.teamMemberId);
}

// Full board detail iff the actor is a member (or admin). Null otherwise.
export async function getBoardForActor(actor: TeamActor, slug: string): Promise<BoardDetail | null> {
  const detail = await getBoardBySlug(slug);
  if (!detail) return null;
  if (actor.isAdmin) return detail;
  const member = await isBoardMember(detail.board.id, actor.personId, actor.teamMemberId);
  return member ? detail : null;
}


export type RecentTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  boardSlug: string;
  boardName: string;
};

// The actor's most recently created open tasks, for the /team home glance.
export async function getMyRecentTasks(actor: TeamActor, limit: number): Promise<RecentTask[]> {
  const { data: taskData } = await companyOs
    .from("tasks")
    .select("id, title, priority, due_date, board_id, created_at")
    .eq("assignee_id", actor.personId)
    .neq("status", "done")
    .is("parent_task_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (taskData ?? []) as {
    id: string;
    title: string;
    priority: TaskPriority;
    due_date: string | null;
    board_id: string | null;
  }[];
  if (!rows.length) return [];

  const boardIds = [...new Set(rows.map((r) => r.board_id).filter(Boolean) as string[])];
  const { data: boardRows } = await companyOs.from("boards").select("id, slug, name").in("id", boardIds);
  const bmap = new Map(
    (boardRows ?? []).map((b) => [b.id, b as { id: string; slug: string; name: string }]),
  );
  return rows
    .filter((r) => r.board_id && bmap.has(r.board_id))
    .map((r) => {
      const b = bmap.get(r.board_id as string)!;
      return {
        id: r.id,
        title: r.title,
        priority: r.priority,
        dueDate: r.due_date,
        boardSlug: b.slug,
        boardName: b.name,
      };
    });
}
