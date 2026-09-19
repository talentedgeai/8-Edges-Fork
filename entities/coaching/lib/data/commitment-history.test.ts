import { beforeEach, describe, expect, it, vi } from "vitest";

// K.14: a commitment is a target, and a target can change whenever. The rule the
// board relies on is that the SAME call that changes a commitment records the
// change, so the current wording and status on coaching_commitments and the
// history behind them can never disagree — and that a rejected write records
// nothing, because nothing changed.

type Call = { table: string; ops: string[]; payloads: unknown[] };
const calls: Call[] = [];

// What the fake Supabase hands back per table. A test sets `rows` before the
// call it is exercising; anything unset resolves to an empty result.
const rows: Record<string, unknown> = {};

function builderFor(table: string) {
  const record: Call = { table, ops: [], payloads: [] };
  calls.push(record);
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows[table] ?? null, error: null }).then(resolve),
  };
  for (const op of ["select", "insert", "update", "delete", "eq", "in", "is", "order", "limit", "maybeSingle", "single"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/boards", () => ({
  selectTasks: () => builderFor("tasks"),
  selectBoardMembers: () => builderFor("board_members"),
  selectBoardColumns: () => builderFor("board_columns"),
  insertTasks: async () => ({ error: null }),
  SUBJECT_COMMITMENT: "commitment",
}));

import { coachUpdateCommitment } from "./commitments";
import { myUpdateCommitmentStatus } from "./member";
import { myUpdateCommitmentDetails } from "./member-commitments";
import { columnFor } from "../types";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1", personId: "p-1", isAdmin: false } as unknown as TeamActor;
const historyInserts = () =>
  calls
    .filter((c) => c.table === "coaching_commitment_history" && c.ops.includes("insert"))
    .map((c) => c.payloads[c.ops.indexOf("insert")] as unknown[]);

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("columnFor maps the status vocabulary onto the board", () => {
  it("open, on_track and needs_attention all read as On it", () => {
    expect(columnFor("open")).toBe("on_it");
    expect(columnFor("on_track")).toBe("on_it");
    expect(columnFor("needs_attention")).toBe("on_it");
  });

  it("blocked and completed have a column of their own", () => {
    expect(columnFor("blocked")).toBe("blocked");
    expect(columnFor("completed")).toBe("done");
  });

  it("dropped is off the board", () => {
    expect(columnFor("dropped")).toBeNull();
  });
});

describe("the writer records the change it made", () => {
  it("writes a history row on a member's status change", async () => {
    rows.coaching_commitments = {
      id: "c-1",
      coaching_profile_id: "pr-1",
      status: "on_track",
      coaching_profiles: { team_member_id: "tm-1" },
    };
    const res = await myUpdateCommitmentStatus(actor, "c-1", "blocked", "waiting on the vendor");
    expect(res.ok).toBe(true);
    expect(historyInserts()).toEqual([
      [
        {
          commitment_id: "c-1",
          changed_by: "tm-1",
          title_before: null,
          title_after: null,
          status_before: "on_track",
          status_after: "blocked",
        },
      ],
    ]);
  });

  it("writes a history row on a title change", async () => {
    rows.coaching_profiles = { id: "pr-1" };
    rows.coaching_commitments = { id: "c-1", created_by: "tm-1", title: "Old wording" };
    const res = await myUpdateCommitmentDetails(actor, "c-1", { title: "New wording", dueOn: null });
    expect(res.ok).toBe(true);
    expect(historyInserts()).toEqual([
      [
        {
          commitment_id: "c-1",
          changed_by: "tm-1",
          title_before: "Old wording",
          title_after: "New wording",
          status_before: null,
          status_after: null,
        },
      ],
    ]);
  });

  it("writes nothing when ownership rejects the change", async () => {
    // A commitment on someone else's profile: the member tier refuses it, and a
    // refused write must leave no trace in the history either.
    rows.coaching_commitments = {
      id: "c-1",
      coaching_profile_id: "pr-9",
      status: "on_track",
      coaching_profiles: { team_member_id: "tm-other" },
    };
    const res = await myUpdateCommitmentStatus(actor, "c-1", "completed", "");
    expect(res.ok).toBe(false);
    expect(historyInserts()).toEqual([]);
  });

  it("writes nothing when the coach does not own the commitment", async () => {
    rows.coaching_commitments = {
      id: "c-1",
      title: "Theirs",
      status: "on_track",
      coaching_profiles: { coach_id: "tm-other" },
    };
    const res = await coachUpdateCommitment(actor, "c-1", { status: "completed" });
    expect(res.ok).toBe(false);
    expect(historyInserts()).toEqual([]);
  });
});
