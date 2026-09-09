import { beforeEach, describe, expect, it, vi } from "vitest";

// The hub's verbs. Start refuses without a brand or idea and while a run is in
// flight, otherwise sets the first step and runs it in this request; Retry
// clears the error and hands on; Continue hands on only an errorless run; Stop
// clears the state. Every verb guards first (check:action-auth pins that).

vi.mock("@/kernel/identity/admin-auth", () => ({ requireAdmin: async () => ({ email: "admin@edge8.ai" }) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
const recorded: string[] = [];
vi.mock("@/kernel/audit/routine-runs", () => ({
  recordRoutineRun: async (routineId: string, handler: () => Promise<Response>) => {
    recorded.push(routineId);
    return handler();
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
// The step files reached through ./advance build the service-role client at import.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));

const campaign: { id: string; name: string; idea: string | null; objective: null; brandId: string | null; pillarId: null; startsOn: null; writerStep: string | null; writerStartedAt: null; writerError: string | null } = {
  id: "c", name: "n", idea: "idea", objective: null, brandId: "b", pillarId: null, startsOn: null, writerStep: null, writerStartedAt: null, writerError: null,
};
const states: unknown[] = [];
vi.mock("./data", () => ({
  loadCampaign: async () => ({ ok: true, data: { ...campaign } }),
  setWriterState: async (_id: string, s: unknown) => {
    states.push(s);
    return { ok: true };
  },
}));
const kick = vi.fn();
const runWriterStep = vi.fn();
vi.mock("./run-step", () => ({ kickWriterStep: (id: string) => kick(id), runWriterStep: (id: string) => runWriterStep(id), WRITER_ROUTINE_ID: "/api/cron/writer-agent/" }));

const { startWriter, retryWriterStep, continueWriter, stopWriter } = await import("./actions");
const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  states.length = 0;
  recorded.length = 0;
  kick.mockClear();
  runWriterStep.mockReset();
  Object.assign(campaign, { idea: "idea", brandId: "b", writerStep: null, writerError: null });
});

describe("startWriter", () => {
  it("rejects a non-uuid id, a campaign without a brand or idea, and a run in flight", async () => {
    expect(await startWriter("nope")).toEqual({ ok: false, error: "Not a campaign id." });
    campaign.brandId = null;
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Set a brand/) });
    campaign.brandId = "b";
    campaign.idea = "";
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Write the campaign idea/) });
    campaign.idea = "idea";
    campaign.writerStep = "seo";
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/already running/) });
    expect(states).toEqual([]);
    expect(runWriterStep).not.toHaveBeenCalled();
  });
  it("sets the first step and runs it in the same request", async () => {
    runWriterStep.mockResolvedValue({ ok: true, campaignId: ID, step: "draft", next: "edit", summary: "Drafted." });
    expect(await startWriter(ID)).toEqual({ ok: true });
    expect(states).toEqual([expect.objectContaining({ step: "draft", error: null, startedAt: expect.any(String) })]);
    expect(runWriterStep).toHaveBeenCalledWith(ID);
    expect(recorded).toEqual(["/api/cron/writer-agent/"]);
  });
  it("surfaces the first step's failure", async () => {
    runWriterStep.mockResolvedValue({ ok: false, campaignId: ID, step: "draft", error: "Draft: too short." });
    expect(await startWriter(ID)).toEqual({ ok: false, error: "Draft: too short." });
  });
});

describe("retry, continue, stop", () => {
  it("retry clears the error on the current step and hands the run on", async () => {
    campaign.writerStep = "edit";
    campaign.writerError = "boom";
    expect(await retryWriterStep(ID)).toEqual({ ok: true });
    expect(states).toEqual([{ step: "edit", error: null }]);
    expect(kick).toHaveBeenCalledWith(ID);
  });
  it("retry and continue refuse when there is no run", async () => {
    expect(await retryWriterStep(ID)).toMatchObject({ ok: false });
    expect(await continueWriter(ID)).toMatchObject({ ok: false });
    expect(kick).not.toHaveBeenCalled();
  });
  it("continue hands on an errorless run and refuses a stopped one", async () => {
    campaign.writerStep = "links";
    expect(await continueWriter(ID)).toEqual({ ok: true });
    expect(kick).toHaveBeenCalledWith(ID);
    campaign.writerError = "boom";
    expect(await continueWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Retry step/) });
  });
  it("stop clears the state", async () => {
    campaign.writerStep = "links";
    expect(await stopWriter(ID)).toEqual({ ok: true });
    expect(states).toEqual([{ step: null, error: null }]);
  });
});
