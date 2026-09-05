import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The roll-up used to run three lookups per contractor inside the loop
// (team_members, compensation_sensitive, contractor_payments). What this test
// pins down is that those are now one query each for the whole batch, and that
// the per-person decisions — rates, the already-decided skip, the insert — come
// out exactly as before.
//
// The fake client mirrors the one beside the board actions: `from(table)`
// returns a chainable builder that resolves to the next scripted response for
// that table and records the operations it saw.

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
  for (const op of [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "lt",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
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
vi.mock("@/entities/portal", () => ({
  updateContractorWorkRequests: () => ({ in: async () => ({ error: null }) }),
}));

const countFor = (table: string) => calls.filter((c) => c.table === table).length;

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});
afterEach(() => vi.clearAllMocks());

function workRequest(id: string, personId: string, name: string) {
  return {
    id,
    person_id: personId,
    actual_hours: 10,
    actual_overtime_hours: 0,
    people: { full_name: name, email: `${personId}@example.com` },
  };
}

describe("rollupContractorPayments", () => {
  it("reads rates and existing payments once for the whole batch", async () => {
    script("contractor_work_requests", {
      data: [workRequest("w1", "p1", "Ann"), workRequest("w2", "p2", "Bo"), workRequest("w3", "p3", "Cy")],
    });
    script("team_members", {
      data: [
        { id: "tm1", person_id: "p1" },
        { id: "tm2", person_id: "p2" },
      ],
    });
    script("compensation_sensitive", {
      data: [
        { team_member_id: "tm1", comp_type: "hourly", amount_cents: 5000, currency: "usd" },
        { team_member_id: "tm2", comp_type: "hourly", amount_cents: 6000, currency: "usd" },
      ],
    });
    // The batched existing-payments read, then p1's insert and totals update.
    script(
      "contractor_payments",
      { data: [{ id: "pay2", status: "paid", person_id: "p2" }] },
      { data: { id: "pay1" } },
      { error: null },
    );
    // The recompute read of everything linked to p1's payment.
    script("contractor_work_requests", { data: [{ actual_hours: 10, actual_overtime_hours: 0 }] });

    const { rollupContractorPayments } = await import("./contractor-payments");
    const result = await rollupContractorPayments("2026-08-01");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // Three contractors, but one lookup each for members and compensation.
    expect(countFor("team_members")).toBe(1);
    expect(countFor("compensation_sensitive")).toBe(1);
    expect(result.created).toBe(1);
    expect(result.requestsLinked).toBe(1);
    // p2's payment is already paid; p3 has no team_members row.
    expect(result.skipped).toEqual([
      "Bo: payment for 2026-08-01 already paid — new work left unlinked",
      "Cy: no team_members row",
    ]);
  });

  it("treats a duplicate team_members row as absent, as maybeSingle did", async () => {
    script("contractor_work_requests", { data: [workRequest("w1", "p1", "Ann")] });
    script("team_members", {
      data: [
        { id: "tm1", person_id: "p1" },
        { id: "tm1b", person_id: "p1" },
      ],
    });
    script("contractor_payments", { data: [] });

    const { rollupContractorPayments } = await import("./contractor-payments");
    const result = await rollupContractorPayments("2026-08-01");
    expect(result).toMatchObject({ created: 0, skipped: ["Ann: no team_members row"] });
  });
});
