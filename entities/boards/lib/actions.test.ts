import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DENIED } from "./card-helpers";

// These actions chain several Supabase writes with no transaction between
// them (moveCardColumn, which shares the fake client, is tested beside its code in
// ./move-card.test.ts). What the tests pin down is the contract that E8-09 introduced: every
// write's `error` is read, a failure after an earlier success says so in the
// message, and a failed lookup is never reported as "not found".
//
// The fake client is deliberately minimal. Each `companyOs.from(table)` call
// hands back a chainable builder that, when awaited, resolves to the next
// scripted `{ data, error }` for that table, in call order. Filter and modifier
// methods are all no-ops that return the builder, so the production query shape
// can change without breaking the fixtures.

type Response = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[] };
  calls.push(record);
  const respond = () => {
    const queue = scripts.get(table) ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = () => {
      record.ops.push(op);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  // endPosition tries the atomic append first; "does not exist" takes the fallback.
  companyOsUntyped: { rpc: async () => ({ data: null, error: { message: "function append_task_position does not exist" } }) },
}));
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/entities/boards/lib/notify", () => ({ notifyBoardAssignee: vi.fn(async () => undefined) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/kernel/identity/admin-auth", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@example.com" })) }));
// The company-os door move-card reaches for (Q2) leads, through the barrel, to
// a module built on unstable_cache at load and to the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); identity keeps both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const opsFor = (table: string) => calls.filter((c) => c.table === table).map((c) => c.ops);

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("closeSprint", () => {
  it("AC3: leaves the sprint open when the rollover stage-log insert fails", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { data: [{ id: "t1" }, { id: "t2" }] }, { error: null }); // open cards, rollover update
    script("task_stage_log", { error: { message: "history unavailable" } });
    const { closeSprint } = await import("./actions");
    const r = await closeSprint("sprint-1", null, "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("history unavailable");
    expect(r.error).toMatch(/rolled over/);
    // Exactly one query touched `sprints` (the lookup); no `.update()` closed it.
    expect(opsFor("sprints")).toEqual([["select", "eq", "maybeSingle"]]);
  });

  it("does not close the sprint when the open-cards read fails", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { error: { message: "read timeout" } });
    const { closeSprint } = await import("./actions");
    const r = await closeSprint("sprint-1", null, "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("read timeout");
    expect(opsFor("sprints")).toHaveLength(1);
  });

  it("closes the sprint once the rollover and its history both persist", async () => {
    script("sprints", { data: { board_id: "board-1" } }, { error: null });
    script("tasks", { data: [{ id: "t1" }] }, { error: null });
    script("task_stage_log", { error: null });
    const { closeSprint } = await import("./actions");
    expect(await closeSprint("sprint-1", null, "board")).toEqual({ ok: true });
    expect(opsFor("sprints")).toHaveLength(2);
  });
});

// E8-10: the guard reads that decide whether a card may be created or re-linked
// used to drop `error`, so a failed lookup surfaced as the "not on this board"
// message — a database outage read to the user as a scoping mistake.
describe("guard reads report the database failure", () => {
  it("createCard says why the column lookup failed instead of 'not on this board'", async () => {
    script("board_columns", { error: { message: "read timeout" } });
    const { createCard } = await import("./actions");
    const r = await createCard({ boardId: "board-1", columnId: "col-a", title: "Write the spec" });
    expect(r).toEqual({ ok: false, error: "read timeout" });
    // The failure stops before any card is written.
    expect(opsFor("tasks")).toEqual([]);
  });

  it("setCardEpic says why the epic lookup failed and leaves the card alone", async () => {
    script("tasks", { data: { board_id: "board-1", epic_id: null } });
    script("epics", { error: { message: "epics unavailable" } });
    const { setCardEpic } = await import("./actions");
    const r = await setCardEpic("task-1", "epic-1", "board");
    expect(r).toEqual({ ok: false, error: "epics unavailable" });
    // Only the guard's own read of `tasks` ran; nothing updated the card.
    expect(opsFor("tasks")).toHaveLength(1);
  });
});

// AR-02: createCard is the first action whose input goes through a zod schema.
// The schema runs after the board guard, so a rejected input never reaches the
// database, and the error string names the field so the user can fix it.
describe("createCard (schema boundary)", () => {
  const good = { boardId: "board-1", columnId: "col-a", title: "Write the spec" };

  it("rejects a blank title with a readable, field-prefixed message and touches no table", async () => {
    const { createCard } = await import("./actions");
    const r = await createCard({ ...good, title: "   " });
    expect(r).toEqual({ ok: false, error: "title: Give the card a title." });
    expect(calls).toHaveLength(0);
  });

  it("rejects a wrongly typed field the way an untyped client could send it", async () => {
    const { createCard } = await import("./actions");
    // The cast is the point: server actions are called over the wire, so the
    // TypeScript signature is not a guarantee about what arrives.
    const r = await createCard({ ...good, humanTokens: "eight" } as unknown as Parameters<typeof createCard>[0]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^humanTokens: /);
    expect(calls).toHaveLength(0);
  });

  it("lets well-formed input through to the handler and inserts the card", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } }); // endPosition, insert
    const { createCard } = await import("./actions");
    expect(await createCard(good)).toEqual({ ok: true, id: "task-new" });
    expect(opsFor("tasks").at(-1)).toContain("insert");
  });
});

// AR-26: every board mutation now enters through `boardMutation`, so the denial
// path is one decision instead of twenty. This suite is the proof: it drives
// every exported mutation with the gate closed and asserts two things at once —
// the caller is told the same thing each time (DENIED, never a per-table "not
// found" that would confirm the row exists), and nothing was written.
describe("boardMutation (the one denial path)", () => {
  // Each case names the table the action reads to learn its board, so the
  // fixture can hand that lookup a row and let the *actor* be the reason the
  // action stops. A null table means the action is handed a board id directly.
  // Blockers and reordering live in their own action files (BL-01/RE-01) but
  // enter through the same boardMutation gate, so the one denial path covers them
  // too; the runner is handed all three modules merged.
  type Actions = typeof import("./actions") & typeof import("./blocker-actions") & typeof import("./reorder-actions");
  const mutations: [name: string, lookup: string | null, run: (m: Actions) => Promise<unknown>][] = [
    ["createCard", null, (m) => m.createCard({ boardId: "board-1", columnId: "col-a", title: "Write the spec" })],
    ["setCardRoadmapItem", "tasks", (m) => m.setCardRoadmapItem("task-1", null, "board")],
    ["updateCard", "tasks", (m) => m.updateCard("task-1", { title: "New" }, "board")],
    ["archiveCard", "tasks", (m) => m.archiveCard("task-1", "board")],
    ["setCardInternal", "tasks", (m) => m.setCardInternal("task-1", true, "board")],
    ["createSprint", null, (m) => m.createSprint("board-1", { name: "Sprint 1" }, "board")],
    ["setCardSprint", "tasks", (m) => m.setCardSprint("task-1", null, "board")],
    ["closeSprint", "sprints", (m) => m.closeSprint("sprint-1", null, "board")],
    ["createEpic", null, (m) => m.createEpic("board-1", { name: "Epic" }, "board")],
    ["updateEpic", "epics", (m) => m.updateEpic("epic-1", { name: "Epic" }, "board")],
    ["setEpicArchived", "epics", (m) => m.setEpicArchived("epic-1", true, "board")],
    ["setCardEpic", "tasks", (m) => m.setCardEpic("task-1", null, "board")],
    ["addSubtask", "tasks", (m) => m.addSubtask("task-1", "Subtask", "board")],
    ["toggleSubtask", "tasks", (m) => m.toggleSubtask("task-1", true, "board")],
    ["addBlocker", "tasks", (m) => m.addBlocker("task-1", "Blocked on API", null, "board")],
    ["toggleBlocker", "tasks", (m) => m.toggleBlocker("blocker-1", true, "board")],
    ["setBlockerAssignee", "tasks", (m) => m.setBlockerAssignee("blocker-1", "person-2", "board")],
    ["reorderCard", "tasks", (m) => m.reorderCard("task-1", ["task-1", "task-2"], "board")],
    ["updateSprintBrief", "sprints", (m) => m.updateSprintBrief("sprint-1", { goal: "Ship" }, "board")],
    ["setSprintMeeting", "sprints", (m) => m.setSprintMeeting("sprint-1", null, "board")],
    ["pullSprintBriefFromMeeting", "sprints", (m) => m.pullSprintBriefFromMeeting("sprint-1")],
    ["setTaskTokens", "tasks", (m) => m.setTaskTokens("task-1", 3, "board")],
    ["addComment", "tasks", (m) => m.addComment("task-1", "Nice", "board")],
    ["restoreCard", "tasks", (m) => m.restoreCard("task-1", "board")],
  ];

  const WRITES = ["insert", "update", "upsert", "delete"];
  const wrote = () => calls.filter((c) => c.ops.some((op) => WRITES.includes(op)));

  afterEach(async () => {
    // The factory's default is a permitted admin; every other suite depends on
    // it, so put it back rather than leaving the gate closed.
    const { boardActorFor } = await import("./access");
    vi.mocked(boardActorFor).mockResolvedValue({ label: "tester", personId: "person-1", isAdmin: true });
  });

  it.each(mutations)("%s denies a non-member and writes nothing", async (_name, lookup, run) => {
    const { boardActorFor } = await import("./access");
    vi.mocked(boardActorFor).mockResolvedValue(null);
    if (lookup) script(lookup, { data: { board_id: "board-1" } });
    const actions = { ...(await import("./actions")), ...(await import("./blocker-actions")), ...(await import("./reorder-actions")) };
    expect(await run(actions)).toEqual({ ok: false, error: DENIED });
    expect(wrote()).toEqual([]);
  });

  it("tells a caller the same thing whether the row is missing or out of reach", async () => {
    // The gate stays open here: the row itself is gone. Before AR-26 this said
    // "Card not found." while a denied member got DENIED, so anyone holding a
    // task id could tell an existing card from a non-existent one.
    script("tasks", { data: null });
    const { archiveCard } = await import("./actions");
    expect(await archiveCard("task-1", "board")).toEqual({ ok: false, error: DENIED });
    expect(wrote()).toEqual([]);
  });

  it("still separates a failed lookup from a missing row", async () => {
    script("tasks", { error: { message: "read timeout" } });
    const { archiveCard } = await import("./actions");
    const r = await archiveCard("task-1", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("read timeout");
    expect(r.error).not.toBe(DENIED);
  });
});
