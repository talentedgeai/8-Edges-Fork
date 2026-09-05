import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These actions chain several Supabase writes with no transaction between
// them (moveCard, which shares the fake client, is tested beside its code in
// entities/team/lib/move-card.test.ts). What the tests pin down is the contract that E8-09 introduced: every
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
