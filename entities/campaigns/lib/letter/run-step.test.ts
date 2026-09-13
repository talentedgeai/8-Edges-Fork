import { beforeEach, describe, expect, it, vi } from "vitest";

// What is the letter's in its run: the one state that parks it (ready, for a
// person's approval) and what ops hears. The hand-off is the shared run loop's
// and is tested once in lib/run-loop.test.ts. Before A.2 the letter's copy of
// the hand-off had no test at all.

const advance = vi.fn();
vi.mock("./advance", () => ({ advanceLetter: (id: string) => advance(id) }));
const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (t: string) => notify(t) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.example.com" }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => undefined }));
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { runLetterStep, LETTER_ROUTINE_ID } = await import("./run-step");

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  process.env.CRON_SECRET = "s3cret";
});

describe("runLetterStep", () => {
  it("hands on to its own step route after a pass", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "gather", next: "pick", summary: "Gathered." });
    await runLetterStep("b1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://www.example.com${LETTER_ROUTINE_ID}`);
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells ops the broadcast is ready for approval, with the summary", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "validate", next: "ready", summary: "Six posts, two rotated." });
    await runLetterStep("b1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Letter agent: broadcast b1 is ready for approval. Six posts, two rotated.");
  });

  it("tells ops where the broadcast stopped", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "b1", step: "write", error: "Write: too long." });
    await runLetterStep("b1");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/stopped at Step 3 of 6: Write\. Write: too long/));
  });
});
