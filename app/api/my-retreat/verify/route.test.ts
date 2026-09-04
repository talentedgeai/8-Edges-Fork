import { beforeEach, describe, expect, it, vi } from "vitest";

const { peopleResult } = vi.hoisted(() => ({
  peopleResult: { data: [], error: null } as { data: unknown[] | null; error: unknown },
}));
vi.mock("@/lib/supabase", () => ({
  companyOs: {
    from: () => ({
      select: () => ({
        ilike: () => ({ limit: () => Promise.resolve(peopleResult) }),
      }),
    }),
  },
}));

const { getEventBySlug } = vi.hoisted(() => ({ getEventBySlug: vi.fn() }));
vi.mock("@/lib/events-server", () => ({ getEventBySlug }));

import { GET } from "./route";
import {
  MY_RETREAT_COOKIE,
  signAccessGrant,
  signEmailVerification,
  verifyAccessGrant,
} from "@/lib/my-retreat/access";

function get(token: string) {
  return GET(
    new Request(`https://www.edge8.ai/api/my-retreat/verify?token=${encodeURIComponent(token)}`),
  );
}

function isExpiredRedirect(res: Response) {
  return (
    res.status === 307 &&
    new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search ===
      "/my-retreat?error=expired"
  );
}

describe("GET /api/my-retreat/verify", () => {
  beforeEach(() => {
    process.env.MY_RETREAT_COOKIE_SECRET = "test-secret-for-my-retreat";
    vi.useRealTimers();
    getEventBySlug.mockReset().mockResolvedValue({ id: "e1", slug: "arca-2026" });
    peopleResult.data = [{ id: "p1", full_name: "Known Client" }];
    peopleResult.error = null;
  });

  // Acceptance criterion 2.
  it("a valid token sets a grant carrying personId and redirects to the hub", async () => {
    const { token } = await signEmailVerification("arca-2026", "known@example.com");
    const res = await get(token);

    expect(new URL(res.headers.get("location")!).pathname).toBe("/my-retreat/arca-2026");
    const cookie = res.cookies.get(MY_RETREAT_COOKIE);
    expect(cookie).toBeDefined();
    const grant = await verifyAccessGrant(cookie!.value);
    expect(grant?.personId).toBe("p1");
    expect(grant?.name).toBe("Known Client");
    expect(grant?.email).toBe("known@example.com");
    expect(grant?.eventSlug).toBe("arca-2026");
  });

  // Acceptance criterion 3.
  it("a tampered token sets nothing", async () => {
    const { token } = await signEmailVerification("arca-2026", "known@example.com");
    const res = await get(token.slice(0, -2) + "xy");
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  it("an expired token sets nothing", async () => {
    const { token } = await signEmailVerification("arca-2026", "known@example.com");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    const res = await get(token);
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  it("a missing token sets nothing", async () => {
    const res = await GET(new Request("https://www.edge8.ai/api/my-retreat/verify"));
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  // The token proves an address, not a person: both are re-checked at redeem
  // time so an archived retreat or a removed contact cannot be walked into.
  it("rejects a token whose retreat no longer resolves", async () => {
    getEventBySlug.mockResolvedValue(null);
    const { token } = await signEmailVerification("arca-2026", "known@example.com");
    const res = await get(token);
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  it("rejects a token whose email is no longer on file", async () => {
    peopleResult.data = [];
    const { token } = await signEmailVerification("arca-2026", "known@example.com");
    const res = await get(token);
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });

  // Domain separation, at the route: a stolen cookie cannot be replayed here.
  it("rejects an access-grant cookie presented as a verification token", async () => {
    const { token } = await signAccessGrant("arca-2026", { email: "known@example.com", personId: "p1" });
    const res = await get(token);
    expect(isExpiredRedirect(res)).toBe(true);
    expect(res.cookies.get(MY_RETREAT_COOKIE)).toBeUndefined();
  });
});
