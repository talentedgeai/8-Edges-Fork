import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// The callback route is the one place a Lark tap becomes a write, so these
// tests pin the gate rather than the happy path alone: an unsigned or
// wrong-token body must never reach a handler, and a tap from someone we
// cannot place as a team member must not either.

const people: { row: { id: string; email: string } | null; error: { message: string } | null } = {
  row: { id: "person-1", email: "member@example.test" },
  error: null,
};
const members: { row: { id: string } | null; error: { message: string } | null } = {
  row: { id: "tm-1" },
  error: null,
};

vi.mock("@/kernel/data/supabase", () => {
  const answer = (table: string) => (table === "people" ? people : members);
  const chain = (table: string): Record<string, unknown> => ({
    select: () => chain(table),
    or: () => chain(table),
    eq: () => chain(table),
    limit: () => chain(table),
    maybeSingle: async () => ({ data: answer(table).row, error: answer(table).error }),
  });
  return { companyOs: { from: (table: string) => chain(table) } };
});

const larkEmailByOpenId = vi.fn(async () => "member@example.test" as string | null);
vi.mock("@/kernel/messaging/lark-api", () => ({ larkEmailByOpenId: () => larkEmailByOpenId() }));

const { POST } = await import("./route");
const { registerCardHandler } = await import("@/kernel/messaging/lark-card");

const TOKEN = "verification-token";
const ENCRYPT_KEY = "encrypt-key";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/lark/card-callback/", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const TAP = { token: TOKEN, open_id: "ou_1", action: { value: { kind: "test-card", commitmentId: "c1" } } };

describe("POST /api/lark/card-callback", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_VERIFICATION_TOKEN", TOKEN);
    vi.stubEnv("LARK_ENCRYPT_KEY", ENCRYPT_KEY);
    people.row = { id: "person-1", email: "member@example.test" };
    people.error = null;
    members.row = { id: "tm-1" };
    members.error = null;
    larkEmailByOpenId.mockResolvedValue("member@example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("503s when neither the token nor the encrypt key is configured", async () => {
    vi.stubEnv("LARK_VERIFICATION_TOKEN", "");
    vi.stubEnv("LARK_ENCRYPT_KEY", "");
    expect((await POST(post(TAP))).status).toBe(503);
  });

  it("401s a wrong verification token", async () => {
    expect((await POST(post({ ...TAP, token: "wrong" }))).status).toBe(401);
  });

  it("401s a signed request whose signature does not match the body", async () => {
    const headers = {
      "x-lark-signature": "deadbeef",
      "x-lark-request-timestamp": "1",
      "x-lark-request-nonce": "n",
    };
    expect((await POST(post(TAP, headers))).status).toBe(401);
  });

  it("accepts a correctly signed request", async () => {
    registerCardHandler("test-card", async () => ({ toast: { type: "success", content: "ok" } }));
    const raw = JSON.stringify(TAP);
    const signature = createHash("sha256").update(`1n${ENCRYPT_KEY}${raw}`).digest("hex");
    const res = await POST(
      new Request("https://example.test/api/lark/card-callback/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lark-signature": signature,
          "x-lark-request-timestamp": "1",
          "x-lark-request-nonce": "n",
        },
        body: raw,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ toast: { type: "success", content: "ok" } });
  });

  it("echoes the url_verification challenge", async () => {
    const res = await POST(post({ type: "url_verification", challenge: "abc123", token: TOKEN }));
    expect(await res.json()).toEqual({ challenge: "abc123" });
  });

  it("dispatches to the registered handler with the resolved team member", async () => {
    const handler = vi.fn(async () => ({ toast: { type: "success" as const, content: "Marked done" } }));
    registerCardHandler("test-card", handler);

    const res = await POST(post(TAP));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ toast: { type: "success", content: "Marked done" } });
    expect(handler).toHaveBeenCalledWith({
      teamMemberId: "tm-1",
      personId: "person-1",
      email: "member@example.test",
      value: { kind: "test-card", commitmentId: "c1" },
    });
  });

  it("toasts rather than dispatching when the open_id is not a team member", async () => {
    registerCardHandler("test-card", async () => ({}));
    people.row = null;

    const res = await POST(post(TAP));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      toast: { type: "error", content: "Your Lark account is not linked to a team member." },
    });
  });

  it("toasts when no handler is registered for the kind", async () => {
    const res = await POST(post({ ...TAP, action: { value: { kind: "unregistered-kind" } } }));
    expect(await res.json()).toEqual({ toast: { type: "error", content: "This card is no longer active." } });
  });

  it("toasts rather than 500ing when a handler throws, so Lark does not retry the tap", async () => {
    registerCardHandler("test-card", async () => {
      throw new Error("boom");
    });
    const res = await POST(post(TAP));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ toast: { type: "error", content: "Something went wrong. Try again." } });
  });
});
