import { beforeEach, describe, expect, it, vi } from "vitest";

// How a run hands itself on, tested once for every agent (A.2). After a
// passing step the next step is kicked with one authenticated call to the
// agent's step route; without a public origin it runs in this function under
// waitUntil instead; a run that parks or stops tells ops once and kicks
// nothing; a skipped tick does neither; no secret, no hand-off. The agent
// under test is a stub definition, so the words an agent chooses are not this
// suite's concern — each agent's run-step test pins its own.

const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (t: string) => notify(t) }));
let origin = "https://www.example.com";
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => origin }));
const waited: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => waited.push(p) }));
const fetchMock = vi.fn(async () => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { agentRunLoop } = await import("./run-loop");

type Step = "one" | "two";
type State = Step | "parked";
const advance = vi.fn<(id: string) => Promise<import("./run-loop").StepResult<Step, State>>>();
const loop = agentRunLoop<Step, State>({
  tag: "stub",
  routineId: "/api/cron/stub-agent/",
  advance,
  parked: (r) => (r.next === "parked" ? `parked: ${r.summary}` : null),
  stopped: (r) => `stopped at ${r.step}: ${r.error}`,
});

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  waited.length = 0;
  origin = "https://www.example.com";
  process.env.CRON_SECRET = "s3cret";
});

describe("run", () => {
  it("kicks the next step after a pass, with the secret, and keeps the request alive", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "one", next: "two", summary: "Done one." });
    const r = await loop.run("c1");
    expect(r).toMatchObject({ ok: true, next: "two" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.example.com/api/cron/stub-agent/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body as string)).toEqual({ campaignId: "c1" });
    expect(waited).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells ops once and kicks nothing when the run parks", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "two", next: "parked", summary: "All good." });
    await loop.run("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("parked: All good.");
  });

  it("tells ops once and kicks nothing when a step's check fails", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "c1", step: "one", error: "Contains an em dash." });
    await loop.run("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("stopped at one: Contains an em dash.");
  });

  it("does nothing more on a skipped tick", async () => {
    advance.mockResolvedValue({ skipped: "No run on this campaign.", campaignId: "c1" });
    expect(await loop.run("c1")).toMatchObject({ skipped: "No run on this campaign." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("runs the next step in this function when there is no public origin", async () => {
    origin = "";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    advance
      .mockResolvedValueOnce({ ok: true, campaignId: "c1", step: "one", next: "two", summary: "Done one." })
      .mockResolvedValueOnce({ ok: true, campaignId: "c1", step: "two", next: "parked", summary: "Done two." });
    const r = await loop.run("c1");
    expect(r).toMatchObject({ ok: true, step: "one", next: "two" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waited).toHaveLength(1);
    await waited[0];
    expect(advance).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith("parked: Done two.");
    warn.mockRestore();
  });
});

describe("kick", () => {
  it("holds until the hand-off has been accepted, then returns", async () => {
    let resolve: (v: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)));
    const started = Date.now();
    const pending = loop.kick("c1");
    resolve(new Response("{}"));
    await pending;
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(waited).toHaveLength(1);
  });

  it("says when the step route answers badly, and does not throw", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await loop.kick("c1");
    await waited[0];
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/\[stub\] hand-off for c1 answered 401/));
    err.mockRestore();
  });

  it("refuses to hand on without the secret, and says so", async () => {
    delete process.env.CRON_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await loop.kick("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/\[stub\] CRON_SECRET/));
    err.mockRestore();
  });
});
