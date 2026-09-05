// The client-visible slice of a company's task board, shared by the client
// portal (/portal/board) and the team client hub (/team/clients/[id]/board) so
// both always render the same thing. PRIVACY HARD LINE: only non-internal,
// non-archived cards for the given companies are returned, and the select
// lists explicit safe columns only.
//
// Auth-agnostic on purpose (same contract as the entity's client-documents.ts):
// the companyIds MUST come from the caller's own scope — portal companyScope or
// the team actor's active staff assignments.

import { companyOs } from "@/kernel/data/supabase";
import { type TaskPriority } from "@/entities/company-os/modules/boards/types";

export type ClientBoardColumn = { id: string; name: string; isDone: boolean };
export type ClientBoardCard = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  columnId: string | null;
  done: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  sprintName: string | null;
  createdAt: string;
};
export type ClientBoardView = {
  boardId: string;
  boardSlug: string;
  boardName: string;
  columns: ClientBoardColumn[];
  cards: ClientBoardCard[];
};

export async function hasClientBoard(companyIds: string[]): Promise<boolean> {
  if (companyIds.length === 0) return false;
  const { data } = await companyOs
    .from("boards")
    .select("id")
    .in("client_company_id", companyIds)
    .eq("status", "active")
    .is("archived_at", null)
    .limit(1);
  return (data ?? []).length > 0;
}

export async function getClientBoardView(
  companyIds: string[],
  opts?: { untaggedOnly?: boolean },
): Promise<ClientBoardView | null> {
  if (companyIds.length === 0) return null;
  let boardQb = companyOs
    .from("boards")
    .select("id, slug, name")
    .in("client_company_id", companyIds)
    .eq("status", "active")
    .is("archived_at", null);
  // untaggedOnly: company-wide boards only (ai_program_id null); program-tagged
  // boards render in their AI Program view instead.
  if (opts?.untaggedOnly) boardQb = boardQb.is("ai_program_id", null);
  const { data: boardRow } = await boardQb.order("sort_order").limit(1).maybeSingle();
  if (!boardRow) return null;
  const board = boardRow as { id: string; slug: string; name: string };

  const [colsRes, tasksRes] = await Promise.all([
    companyOs.from("board_columns").select("id, name, is_done").eq("board_id", board.id).order("position"),
    companyOs
      .from("tasks")
      .select("id, title, priority, due_date, status, board_column_id, assignee_id, sprint_id, created_at")
      .eq("board_id", board.id)
      .eq("internal", false)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .order("position"),
  ]);

  const columns = ((colsRes.data ?? []) as { id: string; name: string; is_done: boolean }[]).map((c) => ({
    id: c.id,
    name: c.name,
    isDone: c.is_done,
  }));
  const tasks = (tasksRes.data ?? []) as {
    id: string;
    title: string;
    priority: TaskPriority;
    due_date: string | null;
    status: string;
    board_column_id: string | null;
    assignee_id: string | null;
    sprint_id: string | null;
    created_at: string;
  }[];

  const personIds = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean) as string[])];
  const sprintIds = [...new Set(tasks.map((t) => t.sprint_id).filter(Boolean) as string[])];
  const [peopleRes, sprintsRes] = await Promise.all([
    personIds.length
      ? companyOs.from("people").select("id, display_name, full_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; full_name: string | null; email: string }[] }),
    sprintIds.length
      ? companyOs.from("sprints").select("id, name").in("id", sprintIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const nameById = new Map(
    (peopleRes.data ?? []).map((p) => [p.id, p.display_name || p.full_name || p.email]),
  );
  const sprintById = new Map((sprintsRes.data ?? []).map((s) => [s.id, s.name]));

  const cards: ClientBoardCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueDate: t.due_date,
    columnId: t.board_column_id,
    done: t.status === "done",
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    sprintName: t.sprint_id ? sprintById.get(t.sprint_id) ?? null : null,
    createdAt: t.created_at,
  }));

  return { boardId: board.id, boardSlug: board.slug, boardName: board.name, columns, cards };
}
