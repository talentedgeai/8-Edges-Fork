import { beforeEach, describe, expect, it, vi } from "vitest";

// The step route: withRoutineRun gates it with the cron bearer and records the
// run, the body must name a campaign, and a valid call runs exactly one step
// through runWriterStep.

const inserted: Record<string, unknown>[] = [];
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) };
      },
    }),
  },
}));

const runWriterStep = vi.fn();
vi.mock("@/entities/company-os/modules/campaigns/writer/run-step", () => ({
  runWriterStep: (id: string) => runWriterStep(id),
  WRITER_ROUTINE_ID: "/api/cron/writer-agent/",
}));

const { POST } = await import("./writer-agent");

const ID = "11111111-1111-4111-8111-111111111111";
const call = (body: unknown, auth?: string) =>
  POST(
    new Request("https://www.edge8.ai/api/cron/writer-agent/", {
      method: "POST",
      headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  runWriterStep.mockReset();
  inserted.length = 0;
  process.env.CRON_SECRET = "s3cret";
});

describe("POST /api/cron/writer-agent/", () => {
  it("401s without the bearer and runs nothing", async () => {
    expect((await call({ campaignId: ID })).status).toBe(401);
    expect((await call({ campaignId: ID }, "Bearer wrong")).status).toBe(401);
    expect(runWriterStep).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });
  it("400s a body without a campaign uuid", async () => {
    expect((await call({ campaignId: "nope" }, "Bearer s3cret")).status).toBe(400);
    expect((await call("not json", "Bearer s3cret")).status).toBe(400);
    expect(runWriterStep).not.toHaveBeenCalled();
  });
  it("runs one step and returns its result", async () => {
    runWriterStep.mockResolvedValue({ ok: true, campaignId: ID, step: "draft", next: "edit", summary: "Drafted." });
    const res = await call({ campaignId: ID }, "Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, next: "edit" });
    expect(runWriterStep).toHaveBeenCalledWith(ID);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ routine_id: "/api/cron/writer-agent/", status: "ok", summary: expect.stringContaining("step draft") });
  });
});
