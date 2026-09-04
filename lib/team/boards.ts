// A team member's boards and cross-board task list. Scope source:
// company_os.board_members for THIS actor's person id, plus active
// staff_assignments (an assignment to a board's client company is implicit
// membership — see lib/boards/access.ts). Admins see every board.
// Every read is filtered to the actor server-side, never from a passed id —
// getBoardForActor returning null IS the authorization for /team/boards/[slug].

import { companyOs } from "@/lib/supabase";
import type { TeamActor } from "@/lib/team-auth";
import { isBoardMember } from "@/lib/boards/access";
import { getBoardBySlug, type BoardDetail } from "@/lib/boards/data";
import { type TaskPriority } from "@/lib/boards/types";
import { OPEN_COMMITMENT_STATUSES, type CommitmentStatus } from "@/lib/coaching/data";

export type MyBoardSummary = {
  id: string;
  slug: string;
  name: string;
  clientName: string | null;
  openCount: number;
  doneCount: number;
  assignedToMe: number;
};

// The actor's boards enriched with client name, open-card count, and how many
// of those cards are assigned to the actor. Powers the Work Boards views.
export async function getMyBoardSummaries(actor: TeamActor): Promise<MyBoardSummary[]> {
  let boardRows: { id: string; slug: string; name: string; client_company_id: string | null }[];
  if (actor.isAdmin) {
    const { data } = await companyOs
      .from("boards")
      .select("id, slug, name, client_company_id")
      .eq("status", "active")
      .is("archived_at", null)
      .order("sort_order");
    boardRows = (data ?? []) as typeof boardRows;
  } else {
    const [memRes, assignRes] = await Promise.all([
      companyOs.from("board_members").select("board_id").eq("person_id", actor.personId),
      companyOs
        .from("staff_assignments")
        .select("company_id")
        .eq("team_member_id", actor.teamMemberId)
        .eq("status", "active"),
    ]);
    const ids = ((memRes.data ?? []) as { board_id: string }[]).map((m) => m.board_id);
    const companyIds = ((assignRes.data ?? []) as { company_id: string }[]).map((a) => a.company_id);
    if (ids.length === 0 && companyIds.length === 0) return [];
    const ors = [
      ...(ids.length ? [`id.in.(${ids.join(",")})`] : []),
      ...(companyIds.length ? [`client_company_id.in.(${companyIds.join(",")})`] : []),
    ];
    const { data } = await companyOs
      .from("boards")
      .select("id, slug, name, client_company_id")
      .or(ors.join(","))
      .eq("status", "active")
      .is("archived_at", null)
      .order("sort_order");
    boardRows = (data ?? []) as typeof boardRows;
  }
  if (boardRows.length === 0) return [];

  const ids = boardRows.map((b) => b.id);
  const companyIds = [...new Set(boardRows.map((b) => b.client_company_id).filter(Boolean))] as string[];
  const [tasksRes, companiesRes] = await Promise.all([
    companyOs
      .from("tasks")
      .select("board_id, status, assignee_id")
      .in("board_id", ids)
      .is("parent_task_id", null)
      .is("archived_at", null),
    companyIds.length
      ? companyOs.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const companyName = new Map(((companiesRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const open = new Map<string, number>();
  const done = new Map<string, number>();
  const mine = new Map<string, number>();
  for (const t of (tasksRes.data ?? []) as { board_id: string; status: string; assignee_id: string | null }[]) {
    if (t.status === "done") {
      done.set(t.board_id, (done.get(t.board_id) ?? 0) + 1);
      continue;
    }
    open.set(t.board_id, (open.get(t.board_id) ?? 0) + 1);
    if (t.assignee_id === actor.personId) mine.set(t.board_id, (mine.get(t.board_id) ?? 0) + 1);
  }

  return boardRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    clientName: b.client_company_id ? companyName.get(b.client_company_id) ?? null : null,
    openCount: open.get(b.id) ?? 0,
    doneCount: done.get(b.id) ?? 0,
    assignedToMe: mine.get(b.id) ?? 0,
  }));
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

export type MyTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  boardSlug: string;
  boardName: string;
  columnName: string;
  doneColumnId: string | null;
};

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

export type MyCommitmentLine = {
  id: string;
  title: string;
  status: CommitmentStatus;
  dueOn: string | null;
};

export type MyWork = { tasks: MyTask[]; commitments: MyCommitmentLine[] };

export async function getMyWork(actor: TeamActor): Promise<MyWork> {
  const { data: taskData } = await companyOs
    .from("tasks")
    .select("id, title, priority, due_date, board_id, board_column_id")
    .eq("assignee_id", actor.personId)
    .neq("status", "done")
    .is("parent_task_id", null)
    .is("archived_at", null);
  const rows = (taskData ?? []) as {
    id: string;
    title: string;
    priority: TaskPriority;
    due_date: string | null;
    board_id: string | null;
    board_column_id: string | null;
  }[];

  let tasks: MyTask[] = [];
  if (rows.length) {
    const boardIds = [...new Set(rows.map((r) => r.board_id).filter(Boolean) as string[])];
    const [boardsRes, colsRes] = await Promise.all([
      companyOs.from("boards").select("id, slug, name").in("id", boardIds),
      companyOs.from("board_columns").select("id, board_id, name, is_done").in("board_id", boardIds),
    ]);
    const bmap = new Map(
      (boardsRes.data ?? []).map((b) => [b.id, b as { id: string; slug: string; name: string }]),
    );
    const colName = new Map<string, string>();
    const doneCol = new Map<string, string>();
    for (const c of (colsRes.data ?? []) as { id: string; board_id: string; name: string; is_done: boolean }[]) {
      colName.set(c.id, c.name);
      if (c.is_done && !doneCol.has(c.board_id)) doneCol.set(c.board_id, c.id);
    }
    tasks = rows
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
          columnName: r.board_column_id ? colName.get(r.board_column_id) ?? "" : "",
          doneColumnId: doneCol.get(r.board_id as string) ?? null,
        };
      })
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }

  // The member's own open coaching commitments (member tier: their profile).
  let commitments: MyCommitmentLine[] = [];
  const { data: prof } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    .maybeSingle();
  const profileId = (prof as { id: string } | null)?.id;
  if (profileId) {
    const { data: cs } = await companyOs
      .from("coaching_commitments")
      .select("id, title, status, due_on")
      .eq("coaching_profile_id", profileId)
      .in("status", OPEN_COMMITMENT_STATUSES as unknown as string[])
      .order("sort_order");
    commitments = ((cs ?? []) as { id: string; title: string; status: CommitmentStatus; due_on: string | null }[]).map(
      (c) => ({ id: c.id, title: c.title, status: c.status, dueOn: c.due_on }),
    );
  }

  return { tasks, commitments };
}
