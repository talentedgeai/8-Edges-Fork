import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The lifecycle is the only thing that writes `status` on a contractor work
// request, so this file is where the workflow is pinned down. Two halves: an
// exhaustive matrix (every status × every actor kind, asserting both what is
// allowed and that everything else is refused), and one case per former write
// site proving the move still lands the same patch and the same event row.
//
// The fake Supabase client is the one from
// entities/boards/lib/actions.test.ts: `companyOs.from(table)`
// returns a chainable builder that resolves to the next scripted response for
// that table and records the operations and payloads it saw.

type Response = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[]; payloads: unknown[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[], payloads: [] as unknown[] };
  calls.push(record);
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    return { data: next?.data ?? null, error: next?.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));

import {
  WORK_REQUEST_LIFECYCLE_STATUSES,
  allowedWorkRequestTransitions,
  moveWorkRequest,
  type WorkRequestActorKind,
} from "./work-request-lifecycle";

const ACTORS: WorkRequestActorKind[] = ["admin", "client", "contractor", "system"];

const only = (table: string) => calls.filter((c) => c.table === table);
const updatePatch = () => only("contractor_work_requests")[0]?.payloads[0];
const eventRow = () => (only("contractor_work_events")[0]?.payloads[0] as unknown[])[0];

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// The whole workflow, written out. Anything not listed here is refused.
const MATRIX: Record<string, Partial<Record<WorkRequestActorKind, string[]>>> = {
  draft: { admin: ["awaiting_estimate", "cancelled"], client: ["cancelled"] },
  awaiting_estimate: { admin: ["cancelled"], client: ["cancelled"], contractor: ["estimate_submitted"] },
  estimate_submitted: {
    admin: ["approved", "rejected", "changes_requested", "cancelled"],
    client: ["approved", "rejected", "changes_requested", "cancelled"],
  },
  changes_requested: { admin: ["cancelled"], client: ["cancelled"], contractor: ["estimate_submitted"] },
  scope_added: { admin: ["cancelled"], client: ["cancelled"], contractor: ["estimate_submitted"] },
  approved: {
    admin: ["scope_added", "cancelled"],
    client: ["scope_added", "cancelled"],
    contractor: ["work_submitted"],
  },
  work_submitted: {
    admin: ["completed", "approved", "cancelled"],
    client: ["completed", "approved", "cancelled"],
  },
  rejected: {},
  completed: {},
  cancelled: {},
};

describe("the work-request transition matrix", () => {
  it("covers every status in the vocabulary, and nothing else", () => {
    expect([...WORK_REQUEST_LIFECYCLE_STATUSES].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  for (const from of Object.keys(MATRIX)) {
    for (const actor of ACTORS) {
      const allowed = MATRIX[from][actor] ?? [];

      it(`lets a ${actor} move a ${from} request to ${allowed.length ? allowed.join(", ") : "nothing"}`, () => {
        expect(allowedWorkRequestTransitions(from, actor).sort()).toEqual([...allowed].sort());
      });

      it(`refuses every other move a ${actor} could ask for from ${from}`, async () => {
        for (const to of WORK_REQUEST_LIFECYCLE_STATUSES) {
          if (allowed.includes(to)) continue;
          calls.length = 0;
          const r = await moveWorkRequest({ id: "req-1", from, to, actor });
          expect(r).toEqual({ ok: false, error: `A ${from} request cannot move to ${to}.` });
          // A refused move touches no table at all.
          expect(calls).toEqual([]);
        }
      });
    }
  }

  it("refuses a move out of a status the vocabulary does not know", async () => {
    const r = await moveWorkRequest({ id: "req-1", from: "invented", to: "approved", actor: "admin" });
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("moveWorkRequest", () => {
  it("filters the update by id and by the from-status, so a second actor cannot double-apply", async () => {
    script("contractor_work_requests", { data: null, error: null });
    script("contractor_work_events", { data: null, error: null });

    const r = await moveWorkRequest({
      id: "req-1",
      from: "estimate_submitted",
      to: "approved",
      actor: "admin",
      event: { actor_type: "admin", type: "approved" },
    });

    expect(r).toEqual({ ok: true });
    const update = only("contractor_work_requests")[0];
    expect(update.ops).toEqual(["update", "eq", "eq"]);
    expect(update.payloads[1]).toEqual(["id", "req-1"]);
    expect(update.payloads[2]).toEqual(["status", "estimate_submitted"]);
  });

  it("does not write the event when the status update fails", async () => {
    script("contractor_work_requests", { error: { message: "row locked" } });
    const r = await moveWorkRequest({
      id: "req-1",
      from: "approved",
      to: "work_submitted",
      actor: "contractor",
      event: { actor_type: "contractor", type: "work_submitted" },
    });
    expect(r).toEqual({ ok: false, error: "row locked" });
    expect(only("contractor_work_events")).toEqual([]);
  });

  it("uses the caller's failure wording when it gave one", async () => {
    script("contractor_work_requests", { error: { message: "23514 check violation" } });
    const r = await moveWorkRequest({
      id: "req-1",
      from: "approved",
      to: "work_submitted",
      actor: "contractor",
      failure: "Something went wrong — please try again.",
    });
    expect(r).toEqual({ ok: false, error: "Something went wrong — please try again." });
  });

  it("still reports success when only the timeline row fails", async () => {
    script("contractor_work_requests", { error: null });
    script("contractor_work_events", { error: { message: "events unavailable" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await moveWorkRequest({
      id: "req-1",
      from: "approved",
      to: "work_submitted",
      actor: "contractor",
      event: { actor_type: "contractor", type: "work_submitted" },
    });
    expect(r).toEqual({ ok: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// One case per site that used to write the literal itself.
describe("the moves the former write sites make", () => {
  const ok = () => {
    script("contractor_work_requests", { error: null });
    script("contractor_work_events", { error: null });
  };

  it("admin sends a draft out — status only, no timeline row", async () => {
    ok();
    const r = await moveWorkRequest({ id: "r", from: "draft", to: "awaiting_estimate", actor: "admin" });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([{ status: "awaiting_estimate", updated_at: "2026-09-06T12:00:00.000Z" }]);
    expect(only("contractor_work_events")).toEqual([]);
  });

  it("contractor submits a first estimate", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "awaiting_estimate",
      to: "estimate_submitted",
      actor: "contractor",
      patch: { estimated_hours: 4, plan_text: "plan", estimate_submitted_at: "2026-09-06T12:00:00.000Z" },
      event: { actor_type: "contractor", actor: "c@example.com", type: "estimate_submitted", body: "plan", meta: { estimated_hours: 4 } },
    });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([
      {
        estimated_hours: 4,
        plan_text: "plan",
        estimate_submitted_at: "2026-09-06T12:00:00.000Z",
        status: "estimate_submitted",
        updated_at: "2026-09-06T12:00:00.000Z",
      },
    ]);
    expect(eventRow()).toEqual({
      request_id: "r",
      actor_type: "contractor",
      actor: "c@example.com",
      type: "estimate_submitted",
      body: "plan",
      meta: { estimated_hours: 4 },
    });
  });

  it("contractor re-estimates after changes were requested", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "changes_requested",
      to: "estimate_submitted",
      actor: "contractor",
      event: { actor_type: "contractor", type: "estimate_resubmitted" },
    });
    expect(r).toEqual({ ok: true });
    expect((eventRow() as { type: string }).type).toBe("estimate_resubmitted");
  });

  it("contractor re-estimates after scope was added", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "scope_added",
      to: "estimate_submitted",
      actor: "contractor",
      event: { actor_type: "contractor", type: "estimate_resubmitted" },
    });
    expect(r).toEqual({ ok: true });
  });

  it("a decider approves an estimate and stamps decided_by/decided_at", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "estimate_submitted",
      to: "approved",
      actor: "client",
      patch: { decided_by: "client@example.com", decided_at: "2026-09-06T12:00:00.000Z" },
      event: { actor_type: "client", actor: "client@example.com", type: "approved", body: null, meta: {} },
    });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([
      {
        decided_by: "client@example.com",
        decided_at: "2026-09-06T12:00:00.000Z",
        status: "approved",
        updated_at: "2026-09-06T12:00:00.000Z",
      },
    ]);
  });

  it("a decider rejects or requests changes on an estimate", async () => {
    for (const [to, type] of [["rejected", "rejected"], ["changes_requested", "info_requested"]] as const) {
      calls.length = 0;
      scripts.clear();
      ok();
      const r = await moveWorkRequest({
        id: "r",
        from: "estimate_submitted",
        to,
        actor: "admin",
        event: { actor_type: "admin", type, body: "why" },
      });
      expect(r).toEqual({ ok: true });
      expect((eventRow() as { type: string }).type).toBe(type);
    }
  });

  it("a decider adds scope, appending to the brief in the same statement", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "approved",
      to: "scope_added",
      actor: "admin",
      patch: { brief: "old\n\n— Added scope —\nmore" },
      event: { actor_type: "admin", type: "scope_added", body: "more" },
    });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([
      { brief: "old\n\n— Added scope —\nmore", status: "scope_added", updated_at: "2026-09-06T12:00:00.000Z" },
    ]);
  });

  it("contractor submits finished work", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "approved",
      to: "work_submitted",
      actor: "contractor",
      patch: { actual_hours: 6, actual_overtime_hours: 0, work_summary: "done", work_link: null, work_submitted_at: "2026-09-06T12:00:00.000Z" },
      event: { actor_type: "contractor", type: "work_submitted", body: "done", meta: { actual_hours: 6, overtime_hours: 0, link: null } },
    });
    expect(r).toEqual({ ok: true });
    expect((eventRow() as { meta: unknown }).meta).toEqual({ actual_hours: 6, overtime_hours: 0, link: null });
  });

  it("a decider accepts the work and stamps accepted_by/accepted_at", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "work_submitted",
      to: "completed",
      actor: "client",
      patch: { accepted_by: "client@example.com", accepted_at: "2026-09-06T12:00:00.000Z" },
      event: { actor_type: "client", type: "accepted" },
    });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([
      {
        accepted_by: "client@example.com",
        accepted_at: "2026-09-06T12:00:00.000Z",
        status: "completed",
        updated_at: "2026-09-06T12:00:00.000Z",
      },
    ]);
  });

  it("a decider sends the work back for revision", async () => {
    ok();
    const r = await moveWorkRequest({
      id: "r",
      from: "work_submitted",
      to: "approved",
      actor: "admin",
      patch: {},
      event: { actor_type: "admin", type: "info_requested", body: "redo" },
    });
    expect(r).toEqual({ ok: true });
    expect(updatePatch()).toEqual([{ status: "approved", updated_at: "2026-09-06T12:00:00.000Z" }]);
  });

  it("cancels from every open status and from no closed one", async () => {
    const open = ["draft", "awaiting_estimate", "estimate_submitted", "changes_requested", "scope_added", "approved", "work_submitted"];
    for (const from of open) {
      calls.length = 0;
      scripts.clear();
      ok();
      const r = await moveWorkRequest({
        id: "r",
        from,
        to: "cancelled",
        actor: "admin",
        event: { actor_type: "admin", type: "cancelled" },
      });
      expect(r).toEqual({ ok: true });
    }
    for (const from of ["rejected", "cancelled", "completed"]) {
      calls.length = 0;
      const r = await moveWorkRequest({ id: "r", from, to: "cancelled", actor: "admin" });
      expect(r.ok).toBe(false);
      expect(calls).toEqual([]);
    }
  });
});
