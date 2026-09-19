import { beforeEach, describe, expect, it, vi } from "vitest";

// What is the letter's in its run: the one state that parks it (ready, for a
// person's approval) and what ops hears. The hand-off is the shared run loop's
// and is tested once in lib/run-loop.test.ts. Before A.2 the letter's copy of
// the hand-off had no test at all.

const advance = vi.fn();
vi.mock("./advance", () => ({ advanceLetter: (id: string) => advance(id) }));
const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: (t: string) => notify(t) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.example.com" }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => undefined }));
const schedule = vi.fn();
vi.mock("./approve", () => ({ scheduleLetter: (id: string) => schedule(id) }));
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

  it("schedules the letter itself when it is ready and tells Marketing when it sends", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.example.com";
    schedule.mockResolvedValue({ ok: true, recipients: 512, firstSendAt: "2026-09-18T01:00:00.000Z" });
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "validate", next: "ready", summary: "Test sent." });
    await runLetterStep("b1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledWith("b1");
    expect(notify).toHaveBeenCalledWith(
      "Letter agent: this week's broadcast is ready for review. It sends to 512 people from Friday 18 Sept, 08:00 GMT+7, 8am in each reader's time zone, unless it is cancelled first. Test sent. Review or cancel: https://www.example.com/admin/revenue/marketing/broadcasts/b1/",
    );
  });

  it("asks for a hand approval when the letter could not be scheduled", async () => {
    schedule.mockResolvedValue({ ok: false, error: "That segment matches nobody." });
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "validate", next: "ready", summary: "Test sent." });
    await runLetterStep("b1");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/could not be scheduled: That segment matches nobody\. Review and approve it by hand/));
  });

  it("tells ops where the broadcast stopped", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "b1", step: "write", error: "Write: too long." });
    await runLetterStep("b1");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/stopped at Step 3 of 6: Write\. Write: too long/));
  });
});
