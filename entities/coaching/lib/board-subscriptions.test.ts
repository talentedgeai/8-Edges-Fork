import { beforeEach, describe, expect, it, vi } from "vitest";

// The board may notice, but only the owner of a promise may answer for it
// (2026-09-18). This handler used to write `status: "completed"` the moment a
// linked card reached a done column, which made the work tracker the author of
// somebody's growth record. It now writes a dated suggestion and nothing else.
//
// These tests pin the two halves that matter: the status is never touched, and
// a commitment that is already closed — or already carrying an unanswered
// suggestion — is left alone, so dismissing the question keeps it dismissed.

type Call = { table: string; ops: string[]; payloads: unknown[] };
let calls: Call[] = [];
let updateError: { message: string } | null = null;

function builderFor(table: string) {
  const record: Call = { table, ops: [], payloads: [] };
  calls.push(record);
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: updateError }).then(resolve),
  };
  for (const op of ["select", "update", "eq", "neq", "is"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/boards", () => ({ SUBJECT_COMMITMENT: "coaching_commitment" }));
vi.mock("@/kernel/events", () => ({ subscribe: () => undefined }));

import { suggestCommitmentKept } from "./board-subscriptions";

const payload = {
  taskId: "task-1",
  boardSlug: "revenue",
  subjectType: "coaching_commitment",
  subjectId: "commit-1",
};

// Every filter the one update carried, as flat [column, value] pairs.
function filtersOf(call: Call): string[][] {
  return call.payloads
    .filter((p): p is unknown[] => Array.isArray(p) && p.length === 2)
    .map((p) => [String(p[0]), String(p[1])]);
}

beforeEach(() => {
  calls = [];
  updateError = null;
});

describe("suggestCommitmentKept", () => {
  it("writes the suggestion and never the status", async () => {
    await suggestCommitmentKept(payload);

    const update = calls.find((c) => c.ops.includes("update"));
    expect(update).toBeDefined();
    const body = update!.payloads[update!.ops.indexOf("update")] as [Record<string, unknown>];
    expect(Object.keys(body[0])).toEqual(["card_done_at"]);
    // The two words this change exists to keep out of a board-driven write.
    expect(body[0]).not.toHaveProperty("status");
    expect(body[0]).not.toHaveProperty("closed_at");
  });

  it("leaves a commitment its owner has already closed alone", async () => {
    await suggestCommitmentKept(payload);
    const update = calls.find((c) => c.ops.includes("update"))!;
    const filters = filtersOf(update);
    expect(filters).toContainEqual(["status", "completed"]);
    expect(filters).toContainEqual(["status", "dropped"]);
    expect(update.ops.filter((o) => o === "neq")).toHaveLength(2);
  });

  it("does not re-ask a question that was dismissed", async () => {
    // Dismissing clears the stamp back to null, so re-stamping a row that is
    // already stamped is the only way the prompt could come back uninvited —
    // the `is(card_done_at, null)` filter is what stops that.
    await suggestCommitmentKept(payload);
    const update = calls.find((c) => c.ops.includes("update"))!;
    expect(update.payloads[update.ops.indexOf("is")]).toEqual(["card_done_at", null]);
  });

  it("ignores a card that is not a commitment", async () => {
    await suggestCommitmentKept({ ...payload, subjectType: "backlog_item" });
    expect(calls).toHaveLength(0);
  });

  it("ignores a commitment card with no subject id", async () => {
    await suggestCommitmentKept({ ...payload, subjectId: null });
    expect(calls).toHaveLength(0);
  });

  it("throws rather than losing the one prompt the member gets", async () => {
    updateError = { message: "connection reset" };
    await expect(suggestCommitmentKept(payload)).rejects.toThrow(/commit-1/);
  });
});
