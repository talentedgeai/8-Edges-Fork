import { beforeEach, describe, expect, it, vi } from "vitest";

// How a run hands itself on. After a passing step the next step is kicked with
// one authenticated call to the step route; a run that reaches ready or stops
// on an error tells ops once and kicks nothing; a skipped tick does neither.
// Recording the run is the caller's job and is covered by the route test.

const advance = vi.fn();
vi.mock("./advance", () => ({ advance: (id: string) => advance(id) }));
const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (t: string) => notify(t) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.edge8.ai" }));
vi.mock("./data", () => ({
  loadBlogAsset: async () => ({ ok: true, data: { id: "blog-1", postedUrl: "https://www.edge8.ai/post/s/" } }),
}));
const waited: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => waited.push(p) }));

const fetchMock = vi.fn(async () => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { runWriterStep, kickWriterStep, WRITER_ROUTINE_ID } = await import("./run-step");

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  waited.length = 0;
  process.env.CRON_SECRET = "s3cret";
});

describe("runWriterStep", () => {
  it("kicks the next step after a pass", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "edit", next: "seo", summary: "Edited." });
    const r = await runWriterStep("c1");
    expect(r).toMatchObject({ ok: true, next: "seo" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.edge8.ai/api/cron/writer-agent/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body as string)).toEqual({ campaignId: "c1" });
    expect(waited).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells ops and kicks nothing when the run reaches ready", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "validate", next: "ready", summary: "All good." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/ready to publish/));
  });

  it("tells ops the live URL and kicks nothing when the run is done", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "channels", next: "done", summary: "Channels drafted." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/published\. https:\/\/www\.edge8\.ai\/post\/s\//));
  });

  it("tells ops and kicks nothing when a step's check fails", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "c1", step: "edit", error: "Edit: Contains an em dash." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/stopped at Step 2 of 10: Edit\. Edit: Contains an em dash/));
  });

  it("does nothing more on a skipped tick", async () => {
    advance.mockResolvedValue({ skipped: "No writer run on this campaign.", campaignId: "c1" });
    expect(await runWriterStep("c1")).toMatchObject({ skipped: "No writer run on this campaign." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("kickWriterStep", () => {
  it("holds until the hand-off has been accepted, then returns", async () => {
    let resolve: (v: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)));
    const started = Date.now();
    const pending = kickWriterStep("c1");
    resolve(new Response("{}"));
    await pending;
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(waited).toHaveLength(1);
  });

  it("refuses to hand on without the secret, and says so", async () => {
    delete process.env.CRON_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await kickWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/CRON_SECRET/));
    err.mockRestore();
  });
});
