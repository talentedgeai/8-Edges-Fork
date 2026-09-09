import { beforeEach, describe, expect, it, vi } from "vitest";

// Both review paths used to ask the database once per row: openReviewCycle
// checked for an existing row per rater kind, and the scheduler's dry run
// checked for an existing cycle per member per moment. These tests pin the
// batched shape — one read for the whole set — and that the insert-or-skip
// decision that comes out of it is unchanged.

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
  for (const op of ["select", "insert", "update", "eq", "in", "order", "limit", "single", "maybeSingle"]) {
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
// reviews.ts reaches identity guards wrapped in React's `cache`, which the
// React resolved in the vitest environment does not provide.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => ({ ok: true })) }));

const countFor = (table: string) => calls.filter((c) => c.table === table).length;

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});

describe("openReviewCycle", () => {
  it("reads both rater kinds in one query and inserts only the missing side", async () => {
    script(
      "performance_reviews",
      { data: [{ id: "self-1", rater_kind: "self" }] }, // the batched existence read
      { data: { id: "mgr-1" } }, // the manager insert
    );

    const { openReviewCycle } = await import("./reviews");
    const result = await openReviewCycle({
      teamMemberId: "tm1",
      managerId: "tm9",
      reviewType: "midyear",
      cycleLabel: "2026-midyear",
    });

    // One read plus one insert — the read is no longer per rater kind.
    expect(countFor("performance_reviews")).toBe(2);
    expect(result).toEqual({ created: 1, selfId: "self-1", managerId: "mgr-1" });
  });
});

describe("runReviewScheduler (dry run)", () => {
  it("reads existing cycles once for every member", async () => {
    const members = Array.from({ length: 4 }, (_, i) => ({
      id: `tm${i}`,
      manager_id: "mgr",
      start_date: "2026-08-01",
      contract_start_date: null,
      people: { full_name: `Member ${i}`, first_name: null, preferred_name: null, email: `m${i}@example.com` },
    }));
    script("team_members", { data: members }, { data: [] }); // members, then manager emails
    script(
      "performance_reviews",
      { data: [] }, // the probation-history read
      { data: [] }, // the batched dry-run cycle read
      { data: [] }, // the pending-reminders read
    );

    const { runReviewScheduler } = await import("./review-scheduler");
    const result = await runReviewScheduler("2026-09-12", { dryRun: true });

    // Four members, each with a probation moment in window: three reads total,
    // none of them per member.
    expect(countFor("performance_reviews")).toBe(3);
    expect(result.opened).toHaveLength(4);
  });
});
