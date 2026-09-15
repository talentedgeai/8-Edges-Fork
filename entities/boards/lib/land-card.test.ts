import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, opsFor, resetFake, script } from "./testing/fake-company-os";
import { SUBJECT_COMMITMENT } from "./types";

// The landing contract, tested once for both moves (A.1). landCard chains
// several writes with no transaction between them; what these tests pin is
// the order and the reporting: every write's `error` is read, a failure after
// the move persisted says so in the message and is reported last — after the
// stage log, the audit row and the completion event the move earned — and a
// done column closes the card's open children while any other touches none.
// The scripted `tasks` order is the order landCard asks: the top position,
// the card update, then (on done) the children close.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// One sequence for the follow-ups, so their order can be asserted, not only
// that each happened.
const sequence: string[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => { sequence.push("audit"); }) }));
const published: [string, unknown][] = [];
vi.mock("@/kernel/events", () => ({ publish: async (n: string, p: unknown) => { sequence.push("publish"); published.push([n, p]); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { landCard } = await import("./land-card");
const { recordAudit } = await import("@/kernel/audit/audit");

const ACTOR = { label: "tester", personId: "person-1", isAdmin: true };
const landing = (isDone: boolean) => ({
  taskId: "task-1",
  actor: ACTOR,
  from: { boardId: "board-1", columnId: "col-a" },
  to: { boardId: "board-1", boardSlug: "board", columnId: isDone ? "col-done" : "col-b", isDone },
  subject: { type: SUBJECT_COMMITMENT, id: "commit-1" },
  logNote: null,
  refreshSlugs: ["board"],
});

beforeEach(() => {
  resetFake();
  published.length = 0;
  sequence.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("landCard", () => {
  it("writes the landing and returns ok when every write succeeds", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(false))).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(cardUpdate?.payloads[0]).toEqual(
      expect.objectContaining({ board_id: "board-1", board_column_id: "col-b", status: "open", completed_at: null, position: 1 }),
    );
    // The update is scoped to this card, by id.
    expect(cardUpdate?.filters).toEqual([["eq", "id", "task-1"]]);
    expect(published).toEqual([]);
  });

  it("carries the caller's extra columns in the same update and the extra audit fields", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    await landCard({ ...landing(false), also: { sprint_id: null, epic_id: null }, auditExtra: { from_board_id: "board-0" } });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ sprint_id: null, epic_id: null }));
    expect(vi.mocked(recordAudit).mock.calls[0][0].newData).toEqual(expect.objectContaining({ from_board_id: "board-0", sprint_id: null }));
  });

  it("AC1: says the card moved when the stage-log insert fails", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: { message: "stage_log insert exploded" } });
    const r = await landCard(landing(false));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("stage_log insert exploded");
    expect(r.error).toMatch(/Card moved/);
    // The move persisted, so it was audited whether or not the log landed.
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("completes the card, closes its open children and publishes when the column is done", async () => {
    // Three tasks queries on a done landing: the top position, the card
    // update and the children close (W.4).
    script("tasks", { data: null }, { error: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(true))).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.ops.includes("neq"));
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ status: "done", completed_at: expect.any(String) }));
    const children = calls.find((c) => c.table === "tasks" && c.ops.includes("neq"));
    expect(children?.payloads[0]).toEqual({ status: "done", completed_at: expect.any(String) });
    expect(children?.filters).toEqual([["eq", "parent_task_id", "task-1"], ["neq", "status", "done"], ["is", "archived_at", null]]);
    // The trail follows the writes in this order: the card's move persisted,
    // then its history, then the audit row, then the fact for subscribers.
    const logIndex = calls.findIndex((c) => c.table === "task_stage_log");
    expect(logIndex).toBeGreaterThan(calls.indexOf(children!));
    expect(sequence).toEqual(["audit", "publish"]);
    expect(published).toEqual([
      ["board.card.completed", { taskId: "task-1", boardSlug: "board", subjectType: SUBJECT_COMMITMENT, subjectId: "commit-1" }],
    ]);
    // The board half states the fact and writes nothing outside its own
    // tables: whoever cares that a commitment-linked card is done subscribes.
    expect(calls.some((c) => c.table === "coaching_commitments")).toBe(false);
  });

  it("touches no children and publishes nothing when the column is not done", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(false))).toEqual({ ok: true });
    expect(opsFor("tasks").some((ops) => ops.includes("neq"))).toBe(false);
    expect(published).toEqual([]);
  });

  it("still logs, audits and publishes when the children could not be closed, and says so last", async () => {
    script("tasks", { data: null }, { error: null }, { error: { message: "children locked" } });
    script("task_stage_log", { error: null });
    const r = await landCard(landing(true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Card moved");
    expect(r.error).toContain("children locked");
    // The move persisted, so its history and its event are not lost to the
    // children's failure (verifier finding on the first cut of W.4).
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(published.map(([n]) => n)).toContain("board.card.completed");
  });

  it("reports the log failure before the children failure when both happen", async () => {
    script("tasks", { data: null }, { error: null }, { error: { message: "children locked" } });
    script("task_stage_log", { error: { message: "log down" } });
    const r = await landCard(landing(true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("log down");
  });

  it("returns the database message and writes nothing more when the card update fails", async () => {
    script("tasks", { data: null }, { error: { message: "tasks locked" } });
    const r = await landCard(landing(true));
    expect(r).toEqual({ ok: false, error: "tasks locked" });
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(false);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });
});
