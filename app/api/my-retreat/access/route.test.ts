import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal stand-in for the one query this route makes:
//   companyOs.from("people").select(...).ilike("email", …).limit(1)
const { peopleResult, sendTransactionalEmail, resolveAccessCode } = vi.hoisted(() => ({
  peopleResult: { data: [], error: null } as { data: unknown[] | null; error: unknown },
  sendTransactionalEmail: vi.fn(
    async (_opts: { to: string; subject: string; html: string; logBody?: string }) => true,
  ),
  resolveAccessCode: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  companyOs: {
    from: () => ({
      select: () => ({
        ilike: () => ({
          limit: () => Promise.resolve(peopleResult),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/email", () => ({ sendTransactionalEmail }));
vi.mock("@/lib/site-origin", () => ({ getSiteOrigin: () => "https://www.edge8.ai" }));

vi.mock("@/lib/my-retreat/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/my-retreat/access")>();
  return { ...actual, resolveAccessCode };
});

import { POST } from "./route";
import {
  MY_RETREAT_COOKIE,
  verifyAccessGrant,
  verifyEmailVerification,
} from "@/lib/my-retreat/access";

const RETREAT = { eventId: "e1", slug: "arca-2026", title: "ARCA 2026" };

function post(body: unknown) {
  return POST(
    new Request("https://www.edge8.ai/api/my-retreat/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/my-retreat/access", () => {
  beforeEach(() => {
    process.env.MY_RETREAT_COOKIE_SECRET = "test-secret-for-my-retreat";
    sendTransactionalEmail.mockClear();
    resolveAccessCode.mockReset().mockResolvedValue(RETREAT);
    peopleResult.data = [];
    peopleResult.error = null;
  });

  // Acceptance criterion 1.
  it("a known email is emailed a link and gets no cookie", async () => {
    peopleResult.data = [{ id: "p1", full_name: "Known Client" }];

    const res = await post({ code: "abc", registration: { email: "Known@Example.com" } });
    const json = (await res.json()) as { ok: boolean; verificationSent?: boolean };

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, verificationSent: true });
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = sendTransactionalEmail.mock.calls[0][0];
    expect(sent.to).toBe("known@example.com");

    // The mailed link must carry a real verification token for this retreat.
    const href = /href="([^"]+)"/.exec(sent.html)?.[1] ?? "";
    const token = decodeURIComponent(new URL(href.replace(/&amp;/g, "&")).searchParams.get("token") ?? "");
    const payload = await verifyEmailVerification(token);
    expect(payload?.eventSlug).toBe("arca-2026");
    expect(payload?.email).toBe("known@example.com");

    // The link is a bearer credential — it must not be persisted to the CRM log.
    expect(sent.logBody).toBeTruthy();
    expect(sent.logBody).not.toContain(token);
  });

  // Acceptance criterion 4 — unchanged behaviour for the no-identity path.
  it("an unknown email with a name still unlocks in place", async () => {
    const res = await post({
      code: "abc",
      registration: { email: "New@Example.com", name: "New Guest" },
    });
    const json = (await res.json()) as { ok: boolean; redirect?: string };

    expect(json).toEqual({ ok: true, redirect: "/my-retreat/arca-2026" });
    const cookie = res.cookies.get(MY_RETREAT_COOKIE);
    expect(cookie).toBeDefined();
    const grant = await verifyAccessGrant(cookie!.value);
    expect(grant?.eventSlug).toBe("arca-2026");
    expect(grant?.email).toBe("new@example.com");
    expect(grant?.name).toBe("New Guest");
    expect(grant?.personId).toBeUndefined();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("an unknown email without a name still asks for one", async () => {
    const res = await post({ code: "abc", registration: { email: "new@example.com" } });
    const json = (await res.json()) as { ok: boolean; needName?: boolean };
    expect(res.status).toBe(404);
    expect(json.needName).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  it("a bad code still fails before any lookup", async () => {
    resolveAccessCode.mockResolvedValue(null);
    const res = await post({ code: "nope", registration: { email: "known@example.com" } });
    expect(res.status).toBe(401);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("code-only still returns the retreat title without a cookie", async () => {
    const res = await post({ code: "abc" });
    expect(await res.json()).toEqual({ ok: true, retreat: { title: "ARCA 2026" } });
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });
});
