import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The failure alert. On 11 to 15 September 2026 the daily coaching cycle
// errored five runs in a row and nobody noticed until a table read on the
// 16th. withRoutineRun now posts to the Operations Lark chat when a routine
// errors on two consecutive runs, once per streak: the second error alerts,
// the third and later stay quiet, and a recovery resets the streak.

const inserted: unknown[] = [];
let previousRuns: { status: string }[] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: (row: unknown) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) };
      },
      select: () => ({
        eq: () => ({
          lt: () => ({
            order: () => ({
              limit: async () => ({ data: previousRuns, error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

const notifyOps = vi.fn(async (_text: string) => true);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (text: string) => notifyOps(text) }));

const { withRoutineRun } = await import("@/kernel/audit/routine-runs");

const SECRET = "test-cron-secret";
const request = () => new Request("https://example.test/api/cron/thing", { headers: { authorization: `Bearer ${SECRET}` } });
const failing = async () => {
  throw new Error("boom");
};

describe("withRoutineRun failure alert", () => {
  const previous = process.env.CRON_SECRET;
  beforeEach(() => {
    inserted.length = 0;
    notifyOps.mockClear();
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  it("stays quiet on the first error", async () => {
    previousRuns = [{ status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("alerts once on the second consecutive error, naming the routine and the error", async () => {
    previousRuns = [{ status: "error" }, { status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
    const text = String(notifyOps.mock.calls[0]?.[0]);
    expect(text).toContain("/api/cron/thing/");
    expect(text).toContain("boom");
  });

  it("stays quiet on the third and later errors of the same streak", async () => {
    previousRuns = [{ status: "error" }, { status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("treats a routine with one earlier run as a streak of two", async () => {
    previousRuns = [{ status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
  });

  it("never alerts on a successful run", async () => {
    previousRuns = [{ status: "error" }, { status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), async () => Response.json({ ok: true }));
    expect(notifyOps).not.toHaveBeenCalled();
  });
});
