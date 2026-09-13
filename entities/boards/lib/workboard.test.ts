import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getWorkboard is the one read behind every workboard surface (WB-01). What
// these tests pin down is the two things a surface relies on it for: the
// PRIVACY HARD LINE of clientSafe (no internal card and no working notes ever
// leave the server for a client), and the lane merge (a lane is a column
// name, and a card lands on the lane its own board's column is named).
//
// The fake client is the one actions.test.ts uses: every `companyOs.from(t)`
// hands back a chainable builder that, when awaited, resolves to the next
// scripted response for that table, in call order.

type Response = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Response[]>();

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "eq", "neq", "in", "is", "not", "order", "limit", "range", "single", "maybeSingle"]) {
    builder[op] = () => builder;
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
// The door this file reaches for pulls the entity barrel, and through it a
// module built on unstable_cache at load and the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); these keep both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const { getWorkboard } = await import("./workboard");

const DAY = 86_400_000;
const board = (id: string, client: string | null) => ({
  id,
  name: `Board ${id}`,
  slug: `board-${id}`,
  description: null,
  client_company_id: client,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 1,
});
const column = (id: string, board_id: string, name: string, position: number, is_done = false) => ({ id, board_id, name, position, is_done });
const task = (over: Record<string, unknown>) => ({
  id: "t",
  title: "Card",
  description: "notes",
  board_id: "b1",
  board_column_id: "c1",
  sprint_id: null,
  epic_id: null,
  position: 1,
  assignee_id: null,
  created_by: null,
  status: "open",
  priority: "p2",
  due_date: null,
  human_tokens: 3,
  completed_at: null,
  internal: false,
  subject_type: null,
  subject_id: null,
  parent_task_id: null,
  metadata: { source: "agent" },
  archived_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  scripts.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// Two client boards; the second renamed its middle column.
function scriptTwoBoards(tasks: unknown[]) {
  script("boards", { data: [board("b1", "co1"), board("b2", "co2")] });
  script("board_columns", {
    data: [
      column("c1", "b1", "To do", 0),
      column("c2", "b1", "Doing", 1),
      column("c3", "b1", "Done", 2, true),
      column("c4", "b2", "To do", 0),
      column("c5", "b2", "In progress", 1),
      column("c6", "b2", "Done", 2, true),
    ],
  });
  script("board_members", { data: [] });
  script("sprints", { data: [] });
  script("epics", { data: [] });
  script("tasks", { data: tasks });
  script("staff_assignments", { data: [] });
  script("companies", { data: [{ id: "co1", name: "Acme" }, { id: "co2", name: "Beta" }] });
  script("person_companies", { data: [] });
  script("people", { data: [{ id: "p1", display_name: "Quan", full_name: null, email: "q@x" }] });
  script("task_stage_log", { data: [] });
  script("task_comments", { data: [{ id: "k1", task_id: "t1", author_label: "Dave", body: "secret", created_at: "2026-09-02T00:00:00Z" }] });
}

describe("getWorkboard lanes", () => {
  it("merges lanes by column name in first-seen order and maps each board's columns", async () => {
    scriptTwoBoards([task({ id: "t1", assignee_id: "p1" }), task({ id: "t2", board_id: "b2", board_column_id: "c5" })]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.lanes.map((l) => l.id)).toEqual(["To do", "Doing", "Done", "In progress"]);
    expect(wb.lanes.find((l) => l.id === "Done")?.isDone).toBe(true);
    expect(wb.boards[1].laneColumn).toEqual({ "To do": "c4", "In progress": "c5", Done: "c6" });
    expect(wb.cards.map((c) => c.laneId)).toEqual(["To do", "In progress"]);
    expect(wb.clients.map((c) => c.name)).toEqual(["Acme", "Beta"]);
    expect(wb.cards[0].comments).toHaveLength(1);
  });

  it("scopes to an assignee and drops done cards older than the window on a many-board scope", async () => {
    const old = new Date(Date.now() - 30 * DAY).toISOString();
    const recent = new Date(Date.now() - 2 * DAY).toISOString();
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "t2", assignee_id: "p1", status: "done", completed_at: old, board_column_id: "c3" }),
      task({ id: "t3", assignee_id: "p1", status: "done", completed_at: recent, board_column_id: "c3" }),
      task({ id: "t4", assignee_id: "p9" }),
      task({ id: "sub", parent_task_id: "t1", assignee_id: "p1" }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" }, assigneeId: "p1" });
    expect(wb.cards.map((c) => c.id)).toEqual(["t1", "t3"]);
    expect(wb.cards[0].subtasks.map((s) => s.id)).toEqual(["sub"]);
  });

  it("orders the Done lane newest to oldest by completion, leaving other lanes in position order", async () => {
    const older = new Date(Date.now() - 5 * DAY).toISOString();
    const newer = new Date(Date.now() - 1 * DAY).toISOString();
    scriptTwoBoards([
      task({ id: "todo1", position: 0 }),
      task({ id: "done-old", position: 1, status: "done", completed_at: older, board_column_id: "c3" }),
      task({ id: "todo2", position: 2, board_column_id: "c2" }),
      task({ id: "done-new", position: 3, status: "done", completed_at: newer, board_column_id: "c3" }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    const done = wb.cards.filter((c) => c.laneId === "Done").map((c) => c.id);
    expect(done).toEqual(["done-new", "done-old"]);
    // Non-done cards keep their position order.
    expect(wb.cards.filter((c) => c.laneId !== "Done").map((c) => c.id)).toEqual(["todo1", "todo2"]);
  });

  it("splits blocker children out of subtasks and resolves the tag name", async () => {
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "sub", parent_task_id: "t1", title: "A subtask" }),
      task({ id: "blk", parent_task_id: "t1", title: "Blocked on API", assignee_id: "p1", metadata: { kind: "blocker" } }),
      task({ id: "blk2", parent_task_id: "t1", title: "Waiting on client", assignee_id: null, status: "done", metadata: { kind: "blocker" } }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    const card = wb.cards.find((c) => c.id === "t1")!;
    expect(card.subtasks.map((s) => s.id)).toEqual(["sub"]);
    expect(card.blockers).toEqual([
      { id: "blk", body: "Blocked on API", assignee_id: "p1", assignee_name: "Quan", resolved: false },
      { id: "blk2", body: "Waiting on client", assignee_id: null, assignee_name: null, resolved: true },
    ]);
  });
});

describe("getWorkboard clientSafe", () => {
  it("never lets an internal card or the team's working notes leave the server", async () => {
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "t2", internal: true }),
      task({ id: "sub", parent_task_id: "t1" }),
      task({ id: "blk", parent_task_id: "t1", title: "Internal blocker", metadata: { kind: "blocker" } }),
    ]);
    // task_comments is not read at all on a client-safe scope; the scripted
    // response above must go unconsumed.
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards.map((c) => c.id)).toEqual(["t1"]);
    const card = wb.cards[0];
    expect(card.title).toBe("Card");
    expect(card.assignee_name).toBe("Quan");
    expect(card.human_tokens).toBe(3);
    expect(card.description).toBeNull();
    expect(card.comments).toEqual([]);
    expect(card.subtasks).toEqual([]);
    expect(card.blockers).toEqual([]);
    expect(card.metadata).toEqual({});
    expect(card.agent).toBe(true);
    expect(scripts.get("task_comments")).toHaveLength(1);
  });
});
