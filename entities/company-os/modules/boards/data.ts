// Server-only reads for Task Boards. All access is via the service-role
// companyOs client (company_os has RLS on with no policies), so callers that
// need scoping (team/portal) must filter themselves; these admin reads are
// unscoped by design.

import { companyOs } from "@/kernel/data/supabase";
import {
  BOARD_SELECT,
  BOARD_COLUMN_SELECT,
  SPRINT_SELECT,
  EPIC_SELECT,
  TASK_SELECT,
  SUBJECT_COMMITMENT,
  SUBJECT_BACKLOG_ITEM,
  SOURCE_AGENT,
  type BoardRow,
  type BoardColumnRow,
  type SprintRow,
  type EpicRow,
  type TaskRow,
} from "./types";

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
  comments: TaskComment[];
  last_moved_at: string; // latest column-move, else created_at (drives aging)
};

export type BoardDetail = {
  board: BoardRow & { client_name: string | null; program_name: string | null };
  columns: BoardColumnRow[];
  members: BoardPerson[];
  sprints: SprintRow[];
  epics: EpicRow[]; // epics on this board (active + archived), in sort order (the grouping axis)
  cards: BoardCard[];
  backlogItems: BacklogRef[]; // client board's roadmap items, for the link picker
  backlogGroups: BacklogGroupRef[]; // the client's milestones, in roadmap order
  archivedCards: ArchivedCard[]; // for the "Archived" view + restore
};

function personName(p: { display_name: string | null; full_name: string | null; email: string }): string {
  return p.display_name || p.full_name || p.email;
}

// All boards for the admin index, ordered, with client name + light counts.
export async function listBoards(): Promise<BoardListItem[]> {
  const { data: boards } = await companyOs
    .from("boards")
    .select(BOARD_SELECT)
    .is("archived_at", null)
    .order("sort_order");
  const rows = (boards ?? []) as BoardRow[];
  if (rows.length === 0) return [];

  const companyIds = [...new Set(rows.map((b) => b.client_company_id).filter(Boolean))] as string[];
  const boardIds = rows.map((b) => b.id);

  const [companiesRes, membersRes, tasksRes, sprintsRes] = await Promise.all([
    companyIds.length
      ? companyOs.from("companies").select("id, name").in("id", companyIds)
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

  const companyName = new Map((companiesRes.data ?? []).map((c) => [c.id, c.name]));
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
    companyOs
      .from("companies")
      .select("id, name")
      .in("lifecycle_stage", ["customer", "evangelist"])
      .is("archived_at", null)
      .order("name"),
    companyOs.from("ai_programs").select("id, name, company_id").order("name"),
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
  const { data } = await companyOs
    .from("meetings")
    .select("id, title, started_at")
    .is("archived_at", null)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as { id: string; title: string | null; started_at: string | null }[]).map((m) => ({
    id: m.id,
    title: m.title || "Untitled meeting",
    started_at: m.started_at,
  }));
}

// Light list for pickers (e.g. push a commitment to a board).
export async function listActiveBoards(): Promise<{ id: string; slug: string; name: string }[]> {
  const { data } = await companyOs
    .from("boards")
    .select("id, slug, name")
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

// Full board for /admin/boards/[slug] and (reused, scoped) team/portal views.
export async function getBoardBySlug(slug: string): Promise<BoardDetail | null> {
  const { data: boardData } = await companyOs
    .from("boards")
    .select(BOARD_SELECT)
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (!boardData) return null;
  const board = boardData as BoardRow;

  const [columnsRes, membersRes, sprintsRes, epicsRes, tasksRes, assignedRes] = await Promise.all([
    companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).eq("board_id", board.id).order("position"),
    companyOs.from("board_members").select("person_id, role").eq("board_id", board.id),
    companyOs
      .from("sprints")
      .select(SPRINT_SELECT)
      .eq("board_id", board.id)
      .order("sort_order")
      .order("starts_on", { ascending: false }),
    // All epics (active + archived) so a card still tagged with an archived epic
    // resolves its name/color; the toolbar filter offers only the active ones.
    companyOs.from("epics").select(EPIC_SELECT).eq("board_id", board.id).order("sort_order"),
    companyOs
      .from("tasks")
      .select(TASK_SELECT)
      .eq("board_id", board.id)
      .is("archived_at", null)
      .order("position"),
    board.client_company_id
      ? companyOs
          .from("staff_assignments")
          .select("team_members!team_member_id(person_id)")
          .eq("company_id", board.client_company_id)
          .eq("status", "active")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const columns = (columnsRes.data ?? []) as BoardColumnRow[];
  const memberRows = (membersRes.data ?? []) as { person_id: string; role: string }[];
  // Staff assigned to the board's client company are implicit members (see
  // lib/boards/access.ts): union them in so they appear in the member list and
  // assignee picker without a manual board_members row.
  const assignedPersonIds = ((assignedRes.data ?? []) as unknown[])
    .map((row) => {
      const tm = (row as { team_members: { person_id: string } | { person_id: string }[] | null }).team_members;
      return Array.isArray(tm) ? tm[0]?.person_id : tm?.person_id;
    })
    .filter(Boolean) as string[];
  const memberIds = [...new Set([...memberRows.map((m) => m.person_id), ...assignedPersonIds])];
  const sprints = (sprintsRes.data ?? []) as SprintRow[];
  const epics = (epicsRes.data ?? []) as EpicRow[];
  const tasks = (tasksRes.data ?? []) as TaskRow[];

  // Top-level tasks are the board cards; children are subtasks shown in the drawer.
  const parents = tasks.filter((t) => !t.parent_task_id);
  const subtasksByParent = new Map<string, Subtask[]>();
  for (const c of tasks) {
    if (!c.parent_task_id) continue;
    const list = subtasksByParent.get(c.parent_task_id) ?? [];
    list.push({ id: c.id, title: c.title, done: c.status === "done", human_tokens: c.human_tokens });
    subtasksByParent.set(c.parent_task_id, list);
  }

  // People: board members plus any assignee (an assignee might not be a member yet).
  const personIds = [
    ...new Set([...memberIds, ...(parents.map((t) => t.assignee_id).filter(Boolean) as string[])]),
  ];
  // Subject label ids (coaching commitments / client roadmap items linked to cards).
  const commitmentIds = parents
    .filter((t) => t.subject_type === SUBJECT_COMMITMENT && t.subject_id)
    .map((t) => t.subject_id as string);
  const backlogIds = parents
    .filter((t) => t.subject_type === SUBJECT_BACKLOG_ITEM && t.subject_id)
    .map((t) => t.subject_id as string);
  const taskIds = parents.map((t) => t.id);

  // Everything below depends only on the already-resolved tasks/members and the
  // board, not on each other, so run them in ONE round. Previously these ran as
  // ~5 serial round trips, so a phone opening its daily board (this function is
  // reused by /admin, /team, and /portal) paid that latency stacked on a
  // force-dynamic page. Empty-id cases resolve to an empty result without a query.
  const [peopleRes, commitmentsRes, backlogLabelRes, clientCoRes, programRes, clientBacklogRes, roadmapGroupsRes, logsRes, commentsRes] =
    await Promise.all([
      personIds.length
        ? companyOs.from("people").select("id, display_name, full_name, email").in("id", personIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null; full_name: string | null; email: string }[] }),
      commitmentIds.length
        ? companyOs.from("coaching_commitments").select("id, title").in("id", commitmentIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      backlogIds.length
        ? companyOs.from("client_backlog_items").select("id, title").in("id", backlogIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      board.client_company_id
        ? companyOs.from("companies").select("name").eq("id", board.client_company_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      board.ai_program_id
        ? companyOs.from("ai_programs").select("name").eq("id", board.ai_program_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      board.client_company_id
        ? companyOs
            .from("client_backlog_items")
            .select("id, title, group_key")
            .eq("company_id", board.client_company_id)
            .is("archived_at", null)
            .order("sort_order")
        : Promise.resolve({ data: [] as BacklogRef[] }),
      board.client_company_id
        ? companyOs
            .from("client_roadmap_groups")
            .select("key, step_label, title, sort_order")
            .eq("company_id", board.client_company_id)
            .is("archived_at", null)
            .order("sort_order")
        : Promise.resolve({ data: [] as { key: string; step_label: string | null; title: string }[] }),
      taskIds.length
        ? companyOs
            .from("task_stage_log")
            .select("task_id, moved_at, kind")
            .in("task_id", taskIds)
            .eq("kind", "move")
            .order("moved_at", { ascending: false })
        : Promise.resolve({ data: [] as { task_id: string; moved_at: string }[] }),
      taskIds.length
        ? companyOs
            .from("task_comments")
            .select("id, task_id, author_label, body, created_at")
            .in("task_id", taskIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; task_id: string; author_label: string; body: string; created_at: string }[] }),
    ]);

  const nameById = new Map((peopleRes.data ?? []).map((p) => [p.id, personName(p)]));

  const subjectLabel = new Map<string, string>();
  for (const r of (commitmentsRes.data ?? []) as { id: string; title: string }[]) subjectLabel.set(r.id, r.title);
  for (const r of (backlogLabelRes.data ?? []) as { id: string; title: string }[]) subjectLabel.set(r.id, r.title);

  const client_name = (clientCoRes.data as { name: string } | null)?.name ?? null;
  const program_name = (programRes.data as { name: string } | null)?.name ?? null;
  const backlogItems = (clientBacklogRes.data ?? []) as BacklogRef[];
  const backlogGroups: BacklogGroupRef[] = (
    (roadmapGroupsRes.data ?? []) as { key: string; step_label: string | null; title: string }[]
  ).map((g) => ({ key: g.key, label: g.step_label ? `${g.step_label} · ${g.title}` : g.title }));

  // Latest column-move per card, for the days-in-column clock.
  const lastMove = new Map<string, string>();
  for (const l of (logsRes.data ?? []) as { task_id: string; moved_at: string }[]) {
    if (!lastMove.has(l.task_id)) lastMove.set(l.task_id, l.moved_at);
  }

  // Comments per card (oldest first).
  const commentsByTask = new Map<string, TaskComment[]>();
  for (const c of (commentsRes.data ?? []) as {
    id: string;
    task_id: string;
    author_label: string;
    body: string;
    created_at: string;
  }[]) {
    const list = commentsByTask.get(c.task_id) ?? [];
    list.push({ id: c.id, author: c.author_label, body: c.body, createdAt: c.created_at });
    commentsByTask.set(c.task_id, list);
  }

  const cards: BoardCard[] = parents.map((t) => ({
    ...t,
    assignee_name: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    subject_label: t.subject_id ? subjectLabel.get(t.subject_id) ?? null : null,
    agent: (t.metadata as { source?: string } | null)?.source === SOURCE_AGENT,
    subtasks: subtasksByParent.get(t.id) ?? [],
    comments: commentsByTask.get(t.id) ?? [],
    last_moved_at: lastMove.get(t.id) ?? t.created_at,
  }));

  const members: BoardPerson[] = memberIds
    .map((id) => ({ id, name: nameById.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Archived top-level cards, for the "Archived" view + restore.
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const { data: arch } = await companyOs
    .from("tasks")
    .select("id, title, board_column_id, archived_at, archived_by")
    .eq("board_id", board.id)
    .is("parent_task_id", null)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(200);
  const archivedCards: ArchivedCard[] = (
    (arch ?? []) as {
      id: string;
      title: string;
      board_column_id: string | null;
      archived_at: string;
      archived_by: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    title: a.title,
    columnName: a.board_column_id ? columnName.get(a.board_column_id) ?? "" : "",
    archivedAt: a.archived_at,
    archivedBy: a.archived_by,
  }));

  return { board: { ...board, client_name, program_name }, columns, members, sprints, epics, cards, backlogItems, backlogGroups, archivedCards };
}
