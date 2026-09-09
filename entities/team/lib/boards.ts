// A team member's boards and recent tasks. Scope source:
// company_os.board_members for THIS actor's person id, plus active
// staff_assignments (an assignment to a board's client company is implicit
// membership — see lib/boards/access.ts). Admins see every board.
// Every read is filtered to the actor server-side, never from a passed id —
// getBoardForActor returning null IS the authorization for /team/boards/[slug].

import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { getWorkboard, isBoardMember, getBoardBySlug, type BoardDetail, type TaskPriority, type WorkboardData } from "@/entities/company-os";

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
  const { data: taskData, error: tasksError } = await companyOs
    .from("tasks")
    .select("id, title, priority, due_date, board_id, created_at")
    .eq("assignee_id", actor.personId)
    .neq("status", "done")
    .is("parent_task_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (tasksError) console.error("[team/boards] tasks", tasksError);
  const rows = (taskData ?? []) as {
    id: string;
    title: string;
    priority: TaskPriority;
    due_date: string | null;
    board_id: string | null;
  }[];
  if (!rows.length) return [];

  const boardIds = [...new Set(rows.map((r) => r.board_id).filter(Boolean) as string[])];
  const { data: boardRows, error: boardsError } = await companyOs.from("boards").select("id, slug, name").in("id", boardIds);
  if (boardsError) console.error("[team/boards] boards", boardsError);
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

// The member's Workboard: every active board they may work, as one board
// (WB-04). Scope is the same rule isBoardMember applies one board at a time:
// an explicit board_members row, or an active staff assignment to the board's
// client, which puts them on every board of that client. Admins see every
// board, as on /admin. Nothing here is keyed on client input.
export async function getTeamWorkboard(actor: TeamActor): Promise<WorkboardData> {
  if (actor.isAdmin) return getWorkboard({ scope: { kind: "all" } });
  const [memberRes, assignedRes] = await Promise.all([
    companyOs.from("board_members").select("board_id").eq("person_id", actor.personId),
    companyOs.from("staff_assignments").select("company_id").eq("team_member_id", actor.teamMemberId).eq("status", "active"),
  ]);
  if (memberRes.error) console.error("[team/boards] board_members", memberRes.error);
  if (assignedRes.error) console.error("[team/boards] staff_assignments", assignedRes.error);
  const companyIds = [...new Set(((assignedRes.data ?? []) as { company_id: string }[]).map((r) => r.company_id))];
  const clientBoardIds: string[] = [];
  if (companyIds.length > 0) {
    const { data, error } = await companyOs
      .from("boards")
      .select("id")
      .in("client_company_id", companyIds)
      .eq("status", "active")
      .is("archived_at", null);
    if (error) console.error("[team/boards] boards", error);
    for (const b of (data ?? []) as { id: string }[]) clientBoardIds.push(b.id);
  }
  const ids = [...new Set([...((memberRes.data ?? []) as { board_id: string }[]).map((r) => r.board_id), ...clientBoardIds])];
  return getWorkboard({ scope: { kind: "boards", ids } });
}
