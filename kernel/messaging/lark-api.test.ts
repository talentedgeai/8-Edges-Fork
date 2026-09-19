import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listRecentMinutes, sendLarkDm } from "./lark-api";

// The opt-out read hits people; these tests are about the Lark API's own
// failure shapes, so nobody has opted out unless a test says so.
const optedOut = vi.hoisted(() => ({ value: false }));
vi.mock("./dm-preference", () => ({ larkDmOptedOut: async () => optedOut.value }));

// Lark's gateway answers a path it does not serve with HTTP 404, text/plain,
// "404 page not found". The Minutes list endpoint is one of those for a tenant
// app, so once LARK_APP_ID and LARK_APP_SECRET reached production (2026-09-09)
// the daily coaching cycle called it, res.json() threw "Unexpected
// non-whitespace character after JSON at position 4", and every run from
// 2026-09-10 died before walking a single profile. The client promises to be
// fail-soft; these tests pin that a body which is not JSON degrades instead.

type Answer = { body: string; status: number };

function lark(answers: Record<string, Answer>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
      }
      const hit = Object.entries(answers).find(([path]) => url.includes(path));
      if (!hit) throw new Error(`unexpected fetch ${url}`);
      return new Response(hit[1].body, { status: hit[1].status });
    }),
  );
}

const NOT_FOUND: Answer = { body: "404 page not found", status: 404 };

describe("lark-api with a body that is not JSON", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "app");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists no Minutes when the endpoint answers a plain-text 404", async () => {
    lark({ "/minutes/v1/minutes?": NOT_FOUND });
    await expect(listRecentMinutes(4)).resolves.toEqual([]);
  });

  it("skips the DM when the open_id lookup answers a plain-text 404", async () => {
    lark({ "/contact/v3/users/batch_get_id": NOT_FOUND });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
  });

  it("reports a failed DM when the message endpoint answers an HTML error page", async () => {
    lark({
      "/contact/v3/users/batch_get_id": {
        body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com", user_id: "ou_1" }] } }),
        status: 200,
      },
      "/im/v1/messages": { body: "<html>502 Bad Gateway</html>", status: 502 },
    });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
  });

  it("skips the DM for a person who opted out, before any Lark call", async () => {
    // lark({}) throws on any request past the token call, so a lookup or a
    // send would fail the test loudly rather than pass by accident.
    optedOut.value = true;
    lark({});
    try {
      await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
      expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    } finally {
      optedOut.value = false;
    }
  });

  it("still sends the DM when both calls answer JSON with code 0", async () => {
    lark({
      "/contact/v3/users/batch_get_id": {
        body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com", user_id: "ou_1" }] } }),
        status: 200,
      },
      "/im/v1/messages": { body: JSON.stringify({ code: 0, msg: "success" }), status: 200 },
    });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(true);
  });
});
