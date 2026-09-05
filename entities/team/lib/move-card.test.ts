import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBJECT_COMMITMENT } from "@/entities/company-os";

// moveCard chains several Supabase writes with no transaction between
// them (it moved here from the company-os board actions in Q2, with the fake
// client the board actions test still uses). What the tests pin down is the contract that E8-09 introduced: every
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
}));
vi.mock("@/entities/company-os/modules/boards/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/entities/company-os/modules/boards/notify", () => ({ notifyBoardAssignee: vi.fn(async () => undefined) }));
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

const TASK = { id: "task-1", board_id: "board-1", board_column_id: "col-a", subject_type: null, subject_id: null };

describe("moveCard", () => {
  it("AC2: reports the DB message, not 'Card not found', when the lookup errors", async () => {
    script("tasks", { error: { message: "connection reset" } });
    const { moveCard } = await import("./move-card");
    const r = await moveCard("task-1", "col-b", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("connection reset");
    expect(r.error).not.toContain("Card not found");
  });

  it("still says 'Card not found' for a genuine miss", async () => {
    script("tasks", { data: null });
    const { moveCard } = await import("./move-card");
    expect(await moveCard("task-1", "col-b", "board")).toEqual({ ok: false, error: "Card not found." });
  });

  it("AC1: returns ok:false with the DB message when the stage-log insert fails", async () => {
    script("tasks", { data: TASK }, { data: null }, { error: null }); // lookup, endPosition, update
    script("board_columns", { data: { id: "col-b", is_done: false } });
    script("task_stage_log", { error: { message: "stage_log insert exploded" } });
    const { moveCard } = await import("./move-card");
    const r = await moveCard("task-1", "col-b", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("stage_log insert exploded");
    // The message has to admit that the move itself persisted.
    expect(r.error).toMatch(/Card moved/);
  });

  it("returns ok:false naming the commitment when the coaching_commitments update fails", async () => {
    script("tasks", { data: { ...TASK, subject_type: SUBJECT_COMMITMENT, subject_id: "commit-1" } }, { data: null }, { error: null });
    script("board_columns", { data: { id: "col-done", is_done: true } });
    script("task_stage_log", { error: null });
    script("coaching_commitments", { error: { message: "commitment locked" } });
    const { moveCard } = await import("./move-card");
    const r = await moveCard("task-1", "col-done", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("commitment locked");
    expect(r.error).toMatch(/Card moved/);
  });

  it("returns ok:true when every write succeeds", async () => {
    script("tasks", { data: TASK }, { data: null }, { error: null });
    script("board_columns", { data: { id: "col-b", is_done: false } });
    script("task_stage_log", { error: null });
    const { moveCard } = await import("./move-card");
    expect(await moveCard("task-1", "col-b", "board")).toEqual({ ok: true });
  });
});

