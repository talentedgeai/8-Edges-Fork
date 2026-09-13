// The one reader behind every workboard surface (WB-01, 2026-09-07).
//
// Before this file the same cards were read four ways: the board page had
// getBoardBySlug, My Work had its own cross-board read, and the client-safe
// view existed twice (once for "the company's first board", once for "a chosen
// board"). Each drifted. Now there is one read with a scope: which boards, an
// optional assignee, and a client-safe switch. The caller's guard decides the
// scope and this file never does; an unscoped call is an admin read by design.
//
// Lanes merge by column name. Every board seeds the same four columns, so a
// lane is a column name and a drop on "Doing" lands in that card's own board's
// "Doing" column (the board's laneColumn map says which). With one board in
// scope this collapses to the board's own columns in position order.

import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms } from "@/entities/client-programs";
import { selectPersonCompanies } from "@/entities/contacts";
import { selectStaffAssignments } from "@/entities/contacts";
import {
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
} from "./types";
import { hasClientBoard, readBoards, readTasks } from "./workboard-reads";
import type {
  ArchivedCard,
  BacklogGroupRef,
  BacklogRef,
  Blocker,
  BoardCard,
  BoardPerson,
  Subtask,
  TaskComment,
} from "./data";

export type WorkboardScope =
  // Every active board: the Company Dashboard and My Work.
  | { kind: "all" }
  // Named boards: the board page, and a portal program's chosen board.
  | { kind: "boards"; ids: string[] }
  // A client's boards. untaggedOnly keeps company-wide boards only, because
  // program-tagged boards render in their AI Program view.
  | { kind: "companies"; ids: string[]; untaggedOnly?: boolean };

export type WorkboardQuery = {
  scope: WorkboardScope;
  // Only this person's cards (My Work).
  assigneeId?: string;
  // PRIVACY HARD LINE for the portal and the team client hub: internal cards
  // are dropped and the fields a client must not see are blanked before
  // anything leaves the server.
  clientSafe?: boolean;
};

export type WorkboardBoard = BoardRow & {
  client_name: string | null;
  program_name: string | null;
  columns: BoardColumnRow[];
  // Lane name -> this board's column id, for landing a lane drop.
  laneColumn: Record<string, string>;
};

export type WorkboardLane = { id: string; name: string; isDone: boolean };

export type WorkboardCard = BoardCard & { laneId: string };

export type WorkboardData = {
  boards: WorkboardBoard[];
  lanes: WorkboardLane[];
  cards: WorkboardCard[];
  // Board members plus staff assigned to the boards' clients: who may be added
  // as a member, and the seed of the assignee picker.
  members: BoardPerson[];
  // Members plus anyone already assigned a card: the assignee picker.
  people: BoardPerson[];
  // Contacts at the boards' client companies (person_companies), so a blocker
  // can be tagged to a client as well as a team member. Empty on a client-safe read.
  clientContacts: BoardPerson[];
  // Distinct clients across the boards in scope, for the client filter and
  // the add-card client picker.
  clients: { id: string; name: string }[];
  sprints: SprintRow[];
  epics: EpicRow[];
  // Single-board scope only; empty otherwise.
  backlogItems: BacklogRef[];
  backlogGroups: BacklogGroupRef[];
  archivedCards: ArchivedCard[];
};

// On a many-board scope a finished card stays on the Done lane this long, then
// drops off: long enough to feel the week's progress, short enough that the
// lane never becomes an archive. A single board keeps every done card.
const DONE_VISIBLE_DAYS = 14;

export function personName(p: { display_name: string | null; full_name: string | null; email: string }): string {
  return p.display_name || p.full_name || p.email;
}

type PersonRow = { id: string; display_name: string | null; full_name: string | null; email: string };

const empty = (boards: WorkboardBoard[] = []): WorkboardData => ({
  boards,
  lanes: [],
  cards: [],
  members: [],
  people: [],
  clientContacts: [],
  clients: [],
  sprints: [],
  epics: [],
  backlogItems: [],
  backlogGroups: [],
  archivedCards: [],
});

export async function getWorkboard(query: WorkboardQuery): Promise<WorkboardData> {
  const boardRows = await readBoards(query.scope);
  if (boardRows.length === 0) return empty();
  const boardIds = boardRows.map((b) => b.id);
  const single = boardRows.length === 1 ? boardRows[0] : null;
  const clientIds = [...new Set(boardRows.map((b) => b.client_company_id).filter(Boolean) as string[])];
  const programIds = [...new Set(boardRows.map((b) => b.ai_program_id).filter(Boolean) as string[])];

  const [columnsRes, membersRes, sprintsRes, epicsRes, tasks, assignedRes, clientRes, programRes, contactsRes] = await Promise.all([
    companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).in("board_id", boardIds).order("position"),
    companyOs.from("board_members").select("board_id, person_id").in("board_id", boardIds),
    companyOs.from("sprints").select(SPRINT_SELECT).in("board_id", boardIds).order("sort_order").order("starts_on", { ascending: false }),
    // All epics (active + archived) so a card still tagged with an archived
    // epic resolves its name and colour; the toolbar offers only the active ones.
    companyOs.from("epics").select(EPIC_SELECT).in("board_id", boardIds).order("sort_order"),
    readTasks(boardIds),
    // Staff assigned to a board's client company are implicit members (see
    // access.ts), so they join the member list and the assignee picker without
    // a board_members row.
    clientIds.length
      ? selectStaffAssignments("company_id, team_members!team_member_id(person_id)")
          .in("company_id", clientIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as unknown[], error: null }),
    clientIds.length
      ? selectCompanies("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    programIds.length
      ? selectAiPrograms("id, name").in("id", programIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    // Client contacts for the blocker "tag someone" picker. A client-safe read
    // never renders blockers, so it skips the query.
    !query.clientSafe && clientIds.length
      ? selectPersonCompanies("person_id").in("company_id", clientIds)
      : Promise.resolve({ data: [] as { person_id: string }[], error: null }),
  ]);
  for (const [label, res] of [
    ["board_columns", columnsRes],
    ["board_members", membersRes],
    ["sprints", sprintsRes],
    ["epics", epicsRes],
    ["staff_assignments", assignedRes],
    ["companies", clientRes],
    ["ai_programs", programRes],
    ["person_companies", contactsRes],
  ] as const) {
    if (res.error) console.error(`[boards] ${label}`, res.error);
  }

  // Distinct client-contact person ids, for the blocker assignee picker.
  const contactIds = [...new Set(((contactsRes.data ?? []) as { person_id: string }[]).map((r) => r.person_id).filter(Boolean))];

  const clientName = new Map(((clientRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const programName = new Map(((programRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const columns = (columnsRes.data ?? []) as BoardColumnRow[];

  // Lanes in column order, deduped by name; the first board to name a lane
  // fixes its position. A lane is "done" only when every column of that name is.
  const laneOrder: string[] = [];
  const laneDone = new Map<string, boolean>();
  const columnById = new Map<string, BoardColumnRow>();
  const columnsByBoard = new Map<string, BoardColumnRow[]>();
  for (const c of columns) {
    columnById.set(c.id, c);
    columnsByBoard.set(c.board_id, [...(columnsByBoard.get(c.board_id) ?? []), c]);
    if (!laneDone.has(c.name)) {
      laneOrder.push(c.name);
      laneDone.set(c.name, c.is_done);
    } else if (!c.is_done) laneDone.set(c.name, false);
  }
  const lanes: WorkboardLane[] = laneOrder.map((name) => ({ id: name, name, isDone: laneDone.get(name) ?? false }));

  const boards: WorkboardBoard[] = boardRows.map((b) => {
    const cols = columnsByBoard.get(b.id) ?? [];
    return {
      ...b,
      client_name: b.client_company_id ? clientName.get(b.client_company_id) ?? null : null,
      program_name: b.ai_program_id ? programName.get(b.ai_program_id) ?? null : null,
      columns: cols,
      laneColumn: Object.fromEntries(cols.map((c) => [c.name, c.id])),
    };
  });

  // Members: explicit rows plus the staff assigned to each board's client.
  const staffByCompany = new Map<string, string[]>();
  for (const row of (assignedRes.data ?? []) as unknown[]) {
    const r = row as { company_id: string; team_members: { person_id: string } | { person_id: string }[] | null };
    const tm = Array.isArray(r.team_members) ? r.team_members[0] : r.team_members;
    if (!tm?.person_id) continue;
    staffByCompany.set(r.company_id, [...(staffByCompany.get(r.company_id) ?? []), tm.person_id]);
  }
  const memberIds = new Set<string>();
  for (const m of (membersRes.data ?? []) as { board_id: string; person_id: string }[]) memberIds.add(m.person_id);
  for (const b of boardRows) for (const id of staffByCompany.get(b.client_company_id ?? "") ?? []) memberIds.add(id);

  // Top-level tasks are the cards; children are the subtasks in the drawer.
  const doneCutoff = single ? null : new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  let parents = tasks.filter((t) => !t.parent_task_id);
  if (query.assigneeId) parents = parents.filter((t) => t.assignee_id === query.assigneeId);
  if (query.clientSafe) parents = parents.filter((t) => !t.internal);
  if (doneCutoff) parents = parents.filter((t) => t.status !== "done" || (t.completed_at ?? "") >= doneCutoff);
  // Children are either subtasks or blockers (a blocker is flagged
  // metadata.kind === "blocker", BL-01: body is the title, the tag is the
  // assignee, resolved is the done status). The tag name resolves at card build.
  type RawBlocker = { id: string; body: string; assignee_id: string | null; resolved: boolean };
  const subtasksByParent = new Map<string, Subtask[]>();
  const blockersByParent = new Map<string, RawBlocker[]>();
  const blockerAssigneeIds: string[] = [];
  for (const c of tasks) {
    if (!c.parent_task_id) continue;
    if ((c.metadata as { kind?: string } | null)?.kind === "blocker") {
      const list = blockersByParent.get(c.parent_task_id) ?? [];
      list.push({ id: c.id, body: c.title, assignee_id: c.assignee_id, resolved: c.status === "done" });
      blockersByParent.set(c.parent_task_id, list);
      if (c.assignee_id) blockerAssigneeIds.push(c.assignee_id);
      continue;
    }
    const list = subtasksByParent.get(c.parent_task_id) ?? [];
    list.push({ id: c.id, title: c.title, done: c.status === "done", human_tokens: c.human_tokens });
    subtasksByParent.set(c.parent_task_id, list);
  }

  const personIds = [...new Set([...memberIds, ...(parents.map((t) => t.assignee_id).filter(Boolean) as string[]), ...contactIds, ...blockerAssigneeIds])];
  const backlogIds = parents.filter((t) => t.subject_type === SUBJECT_BACKLOG_ITEM && t.subject_id).map((t) => t.subject_id as string);
  const taskIds = parents.map((t) => t.id);
  const singleClient = single?.client_company_id ?? null;

  // Everything below depends only on the resolved tasks and boards, so it runs
  // in one round. Empty-id cases resolve without a query.
  const [peopleRes, backlogLabelRes, clientBacklogRes, roadmapGroupsRes, logsRes, commentsRes, archivedRes] =
    await Promise.all([
      personIds.length
        ? companyOs.from("people").select("id, display_name, full_name, email").in("id", personIds)
        : Promise.resolve({ data: [] as PersonRow[], error: null }),
      backlogIds.length
        ? selectClientBacklogItems("id, title").in("id", backlogIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      singleClient
        ? selectClientBacklogItems("id, title, group_key").eq("company_id", singleClient).is("archived_at", null).order("sort_order")
        : Promise.resolve({ data: [] as BacklogRef[], error: null }),
      singleClient
        ? selectClientRoadmapGroups("key, step_label, title, sort_order").eq("company_id", singleClient).is("archived_at", null).order("sort_order")
        : Promise.resolve({ data: [] as { key: string; step_label: string | null; title: string }[], error: null }),
      taskIds.length
        ? companyOs.from("task_stage_log").select("task_id, moved_at, kind").in("task_id", taskIds).eq("kind", "move").order("moved_at", { ascending: false })
        : Promise.resolve({ data: [] as { task_id: string; moved_at: string }[], error: null }),
      taskIds.length && !query.clientSafe
        ? companyOs.from("task_comments").select("id, task_id, author_label, body, created_at").in("task_id", taskIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; task_id: string; author_label: string; body: string; created_at: string }[], error: null }),
      single && !query.clientSafe
        ? companyOs.from("tasks").select("id, title, board_column_id, archived_at, archived_by").eq("board_id", single.id).is("parent_task_id", null).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as { id: string; title: string; board_column_id: string | null; archived_at: string; archived_by: string | null }[], error: null }),
    ]);
  for (const [label, res] of [
    ["people", peopleRes],
    ["client_backlog_items", backlogLabelRes],
    ["client_backlog_items", clientBacklogRes],
    ["client_roadmap_groups", roadmapGroupsRes],
    ["task_stage_log", logsRes],
    ["task_comments", commentsRes],
    ["tasks", archivedRes],
  ] as const) {
    if (res.error) console.error(`[boards] ${label}`, res.error);
  }

  const nameById = new Map(((peopleRes.data ?? []) as PersonRow[]).map((p) => [p.id, personName(p)]));
  // The card carries the commitment's wording already (boards may not read coaching).
  const subjectLabel = new Map<string, string>();
  for (const t of parents) {
    if (t.subject_type === SUBJECT_COMMITMENT && t.subject_id) subjectLabel.set(t.subject_id, t.title);
  }
  for (const r of (backlogLabelRes.data ?? []) as { id: string; title: string }[]) subjectLabel.set(r.id, r.title);

  // Latest column move per card, for the days-in-column clock.
  const lastMove = new Map<string, string>();
  for (const l of (logsRes.data ?? []) as { task_id: string; moved_at: string }[]) {
    if (!lastMove.has(l.task_id)) lastMove.set(l.task_id, l.moved_at);
  }
  const commentsByTask = new Map<string, TaskComment[]>();
  for (const c of (commentsRes.data ?? []) as { id: string; task_id: string; author_label: string; body: string; created_at: string }[]) {
    const list = commentsByTask.get(c.task_id) ?? [];
    list.push({ id: c.id, author: c.author_label, body: c.body, createdAt: c.created_at });
    commentsByTask.set(c.task_id, list);
  }

  const firstLane = lanes[0]?.id ?? "";
  const cards: WorkboardCard[] = parents.map((t) => {
    const card: WorkboardCard = {
      ...t,
      assignee_name: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
      subject_label: t.subject_id ? subjectLabel.get(t.subject_id) ?? null : null,
      agent: (t.metadata as { source?: string } | null)?.source === SOURCE_AGENT,
      subtasks: subtasksByParent.get(t.id) ?? [],
      blockers: (blockersByParent.get(t.id) ?? []).map((b) => ({
        ...b,
        assignee_name: b.assignee_id ? nameById.get(b.assignee_id) ?? null : null,
      })),
      comments: commentsByTask.get(t.id) ?? [],
      last_moved_at: lastMove.get(t.id) ?? t.created_at,
      laneId: (t.board_column_id && columnById.get(t.board_column_id)?.name) || firstLane,
    };
    // The client sees the card, not the team's working notes on it.
    return query.clientSafe ? clientSafeCard(card) : card;
  });

  // The Done lane always reads newest to oldest, on every surface (admin, team,
  // the client portal). Finished cards have no manual within-column order to
  // preserve, so we sort them by when they were completed, most recent on top.
  // Non-done lanes keep their manual order: we sort only the done cards in
  // place, leaving every other card's slot untouched.
  const laneIsDone = new Map(lanes.map((l) => [l.id, l.isDone]));
  const doneIndexes = cards.reduce<number[]>((acc, c, i) => {
    if (laneIsDone.get(c.laneId)) acc.push(i);
    return acc;
  }, []);
  const doneTime = (c: WorkboardCard) => c.completed_at ?? c.last_moved_at ?? c.created_at ?? "";
  const sortedDone = doneIndexes.map((i) => cards[i]).sort((a, b) => doneTime(b).localeCompare(doneTime(a)));
  doneIndexes.forEach((idx, k) => {
    cards[idx] = sortedDone[k];
  });

  const toPerson = (id: string): BoardPerson => ({ id, name: nameById.get(id) ?? "Unknown" });
  const byName = (a: BoardPerson, b: BoardPerson) => a.name.localeCompare(b.name);
  const members = [...memberIds].map(toPerson).sort(byName);
  const people = personIds.map(toPerson).sort(byName);
  const clientContacts = contactIds.map(toPerson).sort(byName);
  const clients = clientIds
    .map((id) => ({ id, name: clientName.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const archivedCards: ArchivedCard[] = ((archivedRes.data ?? []) as { id: string; title: string; board_column_id: string | null; archived_at: string; archived_by: string | null }[]).map((a) => ({
    id: a.id,
    title: a.title,
    columnName: (a.board_column_id && columnName.get(a.board_column_id)) || "—",
    archivedAt: a.archived_at,
    archivedBy: a.archived_by,
  }));
  const backlogGroups: BacklogGroupRef[] = ((roadmapGroupsRes.data ?? []) as { key: string; step_label: string | null; title: string }[]).map((g) => ({
    key: g.key,
    label: g.step_label ? `${g.step_label} · ${g.title}` : g.title,
  }));

  return {
    boards,
    lanes,
    cards,
    members,
    people,
    clientContacts,
    clients,
    sprints: (sprintsRes.data ?? []) as SprintRow[],
    epics: (epicsRes.data ?? []) as EpicRow[],
    backlogItems: (clientBacklogRes.data ?? []) as BacklogRef[],
    backlogGroups,
    archivedCards,
  };
}

// What a client may see of a card: the title, where it sits, who has it, how
// big it is and when it is due. Never the description, comments, subtasks,
// link labels or metadata, which are the team's working notes.
export function clientSafeCard(card: WorkboardCard): WorkboardCard {
  return {
    ...card,
    description: null,
    comments: [],
    subtasks: [],
    blockers: [],
    subject_type: null,
    subject_id: null,
    subject_label: null,
    metadata: {},
  };
}
