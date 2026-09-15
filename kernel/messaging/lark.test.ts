import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyProduct } from "./lark";

// A Lark custom bot answers a rejected message with HTTP 200 and a non-zero
// `code` in the body, so "the fetch resolved" is not delivery. Between
// 2026-09-09 and 2026-09-11 the Daily Check-in Agent recorded three clean runs
// while nothing reached either chat; these tests pin the response check that
// closed that gap. notifyProduct stands in for all five senders — they differ
// only in which variable they read.

const HOOK = "https://open.larksuite.com/open-apis/bot/v2/hook/test-hook";

function answering(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })),
  );
}

describe("notifyProduct", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_PRODUCT_WEBHOOK_URL", HOOK);
    // The senders log every rejection; the tests assert the return value, and
    // the log would otherwise bury the run's real output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports delivery when Lark answers code 0", async () => {
    answering({ code: 0, msg: "success", data: {} });
    await expect(notifyProduct("morning")).resolves.toBe(true);
  });

  it("reports failure when Lark answers 200 with a non-zero code", async () => {
    answering({ code: 9499, msg: "bad request" });
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reads the older StatusCode shape the same way", async () => {
    answering({ StatusCode: 19001, StatusMessage: "param invalid" });
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure on a non-2xx response", async () => {
    answering({ code: 0 }, 404);
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure when the request never completes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure — and sends nothing — when the webhook is not configured", async () => {
    vi.stubEnv("LARK_PRODUCT_WEBHOOK_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(notifyProduct("morning")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a 200 whose body is not JSON rather than blocking the send", async () => {
    answering("ok");
    await expect(notifyProduct("morning")).resolves.toBe(true);
  });
});
