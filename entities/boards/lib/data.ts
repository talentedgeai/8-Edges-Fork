// Server-only reads for Task Boards. All access is via the service-role
// companyOs client (company_os has RLS on with no policies), so callers that
// need scoping (team/portal) must filter themselves; these admin reads are
// unscoped by design.

import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectAiPrograms } from "@/entities/client-programs";
import { BOARD_SELECT, type BoardRow, type BoardColumnRow, type TaskRow } from "./types";
import { getWorkboard, personName, type WorkboardData, type WorkboardBoard } from "./workboard";

export type BoardListItem = BoardRow & {
  client_name: string | null;
  member_count: number;
  open_count: number;
  done_count: number;
  member_names: string[];
  current_sprint: { id: string; name: string; ends_on: string | null } | null;
};

export type BoardPerson = { id: string; name: string };
export type BacklogRef = { id: string; title: string; group_key: string | null };
// Roadmap milestones (client_roadmap_groups) for grouping the link picker.
export type BacklogGroupRef = { key: string; label: string };

export type Subtask = { id: string; title: string; done: boolean; human_tokens: number | null };
// A blocker on a card: the impediment text, an optional person it is tagged to
// (a team member or a client contact), and whether it is resolved. Stored as a
// child task flagged metadata.kind === "blocker", so it works exactly like a
// subtask (BL-01, 2026-09-08).
export type Blocker = { id: string; body: string; assignee_id: string | null; assignee_name: string | null; resolved: boolean };
export type TaskComment = { id: string; author: string; body: string; createdAt: string };
export type ArchivedCard = {
  id: string;
  title: string;
  columnName: string;
  archivedAt: string;
  archivedBy: string | null;
};

export type BoardCard = TaskRow & {
  assignee_name: string | null;
  subject_label: string | null; // commitment title or roadmap item title
  agent: boolean; // filed by a scheduled routine (metadata.source === 'agent')
  subtasks: Subtask[];
  blockers: Blocker[];
  comments: TaskComment[];
  last_moved_at: string; // latest column-move, else created_at (drives aging)
};

export type BoardDetail = WorkboardData & {
  board: WorkboardBoard;
  columns: BoardColumnRow[];
};

// All boards for the admin index, ordered, with client name + light counts.
export async function listBoards(): Promise<BoardListItem[]> {
  const { data: boards, error: boardsErr } = await companyOs.from("boards").select(BOARD_SELECT).is("archived_at", null).order("sort_order");
  if (boardsErr) console.error("[boards] boards", boardsErr);
  const rows = (boards ?? []) as BoardRow[];
  if (rows.length === 0) return [];

  const companyIds = [...new Set(rows.map((b) => b.client_company_id).filter(Boolean))] as string[];
  const boardIds = rows.map((b) => b.id);

  const [companiesRes, membersRes, tasksRes, sprintsRes] = await Promise.all([
    companyIds.length
      ? selectCompanies("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    companyOs.from("board_members").select("board_id, person_id").in("board_id", boardIds),
    companyOs
      .from("tasks")
      .select("board_id, status")
      .in("board_id", boardIds)
      .is("archived_at", null)
      .is("parent_task_id", null),
    companyOs
      .from("sprints")
      .select("id, board_id, name, ends_on")
      .in("board_id", boardIds)
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const companyRows = (companiesRes.data ?? []) as { id: string; name: string | null }[];
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));
  const memberRows = (membersRes.data ?? []) as { board_id: string; person_id: string }[];

  // Member names feed the avatar stack on the index cards.
  const memberPersonIds = [...new Set(memberRows.map((m) => m.person_id))];
  const { data: memberPeople } = memberPersonIds.length
    ? await companyOs.from("people").select("id, display_name, full_name, email").in("id", memberPersonIds)
    : { data: [] };
  const memberName = new Map(
    ((memberPeople ?? []) as { id: string; display_name: string | null; full_name: string | null; email: string }[]).map(
      (p) => [p.id, personName(p)],
    ),
  );
  const membersByBoard = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = membersByBoard.get(m.board_id) ?? [];
    const name = memberName.get(m.person_id);
    if (name) list.push(name);
    membersByBoard.set(m.board_id, list);
  }

  const openCount = new Map<string, number>();
  const doneCount = new Map<string, number>();
  for (const t of (tasksRes.data ?? []) as { board_id: string; status: string }[]) {
    const target = t.status === "done" ? doneCount : openCount;
    target.set(t.board_id, (target.get(t.board_id) ?? 0) + 1);
  }

  // First active sprint per board (sprints came back in sort_order).
  const sprintByBoard = new Map<string, { id: string; name: string; ends_on: string | null }>();
  for (const s of (sprintsRes.data ?? []) as { id: string; board_id: string; name: string; ends_on: string | null }[]) {
    if (!sprintByBoard.has(s.board_id)) sprintByBoard.set(s.board_id, { id: s.id, name: s.name, ends_on: s.ends_on });
  }

  return rows.map((b) => ({
    ...b,
    client_name: b.client_company_id ? companyName.get(b.client_company_id) ?? null : null,
    member_count: membersByBoard.get(b.id)?.length ?? 0,
    open_count: openCount.get(b.id) ?? 0,
    done_count: doneCount.get(b.id) ?? 0,
    member_names: membersByBoard.get(b.id) ?? [],
    current_sprint: sprintByBoard.get(b.id) ?? null,
  }));
}

// Options for board settings: active team people (member picker) + client
// companies (the board's client link). Admin management surfaces only.
export type ManageOptions = {
  team: BoardPerson[];
  clients: { id: string; name: string }[];
  // All AI Programs with their owning company, so the board settings picker
  // can offer the ones belonging to the selected client.
  programs: { id: string; name: string; company_id: string }[];
};

export async function listBoardManageOptions(): Promise<ManageOptions> {
  const [tmRes, coRes, progRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select("status, people:people!person_id(id, display_name, full_name, email)")
      .in("status", ["active", "on_leave", "notice", "pre_start"]),
    selectCompanies("id, name")
      .in("lifecycle_stage", ["customer", "evangelist"])
      .is("archived_at", null)
      .order("name"),
    selectAiPrograms("id, name, company_id").order("name"),
  ]);

  type PersonEmbed = { id: string; display_name: string | null; full_name: string | null; email: string };
  const seen = new Set<string>();
  const team: BoardPerson[] = [];
  for (const r of (tmRes.data ?? []) as { people: PersonEmbed | PersonEmbed[] | null }[]) {
    const p = Array.isArray(r.people) ? r.people[0] : r.people;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    team.push({ id: p.id, name: p.display_name || p.full_name || p.email });
  }
  team.sort((a, b) => a.name.localeCompare(b.name));
  const clients = (coRes.data ?? []) as { id: string; name: string }[];
  // Surface a failed programs fetch rather than silently offering an empty
  // picker (the settings drawer hides the AI Program select when this is []).
  if (progRes.error) {
    console.error("listBoardManageOptions: ai_programs fetch failed:", progRes.error.message);
  }
  const programs = (progRes.data ?? []) as { id: string; name: string; company_id: string }[];
  return { team, clients, programs };
}

// Recent meetings for the sprint "attach meeting" picker. One weekly meeting
// covers multiple clients, so the same meeting may be attached to many sprints.
export type MeetingOption = { id: string; title: string; started_at: string | null };

export async function listRecentMeetings(limit = 40): Promise<MeetingOption[]> {
  const { data, error: meetingsErr } = await (await import("@/entities/crm")).selectMeetings("id, title, started_at").is("archived_at", null)
    .not("started_at", "is", null).order("started_at", { ascending: false }).limit(limit);
  if (meetingsErr) console.error("[boards] meetings", meetingsErr);
  return ((data ?? []) as { id: string; title: string | null; started_at: string | null }[]).map((m) => ({
    id: m.id,
    title: m.title || "Untitled meeting",
    started_at: m.started_at,
  }));
}

// Light list for pickers (e.g. push a commitment to a board).
export async function listActiveBoards(): Promise<{ id: string; slug: string; name: string }[]> {
  const { data, error: activeErr } = await companyOs
    .from("boards")
    .select("id, slug, name")
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  if (activeErr) console.error("[boards] boards", activeErr);
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

// Full board for /admin/boards/[slug], the sprint pages and the hub tabs: the
// one-board case of getWorkboard (WB-01), with the board itself lifted out so
// the drawers and SprintView keep their shape.
export async function getBoardBySlug(slug: string): Promise<BoardDetail | null> {
  const { data, error } = await companyOs.from("boards").select("id").eq("slug", slug).is("archived_at", null).maybeSingle();
  if (error) console.error("[boards] boards", error);
  if (!data) return null;
  const workboard = await getWorkboard({ scope: { kind: "boards", ids: [(data as { id: string }).id] } });
  const board = workboard.boards[0];
  if (!board) return null;
  return { ...workboard, board, columns: board.columns };
}
