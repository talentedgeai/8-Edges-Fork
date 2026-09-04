import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lib/my-retreat/access` imports the service-role Supabase client at module
// scope. Only the pure signing helpers are under test here, so the client is
// stubbed out — no network, no env requirements beyond the signing secret.
vi.mock("@/lib/supabase", () => ({ companyOs: {} }));

import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  signAccessGrant,
  signEmailVerification,
  verifyAccessGrant,
  verifyEmailVerification,
} from "@/lib/my-retreat/access";

describe("email verification tokens", () => {
  const savedSecret = process.env.MY_RETREAT_COOKIE_SECRET;

  beforeEach(() => {
    process.env.MY_RETREAT_COOKIE_SECRET = "test-secret-for-my-retreat";
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedSecret === undefined) delete process.env.MY_RETREAT_COOKIE_SECRET;
    else process.env.MY_RETREAT_COOKIE_SECRET = savedSecret;
  });

  it("round-trips the retreat slug and the normalized email", async () => {
    const { token } = await signEmailVerification("arca-2026", "Guest@Example.com");
    const payload = await verifyEmailVerification(token);
    expect(payload?.eventSlug).toBe("arca-2026");
    expect(payload?.email).toBe("guest@example.com");
  });

  it("uses a 15-minute TTL", async () => {
    expect(EMAIL_VERIFICATION_TTL_SECONDS).toBe(15 * 60);
    const before = Math.floor(Date.now() / 1000);
    const { token } = await signEmailVerification("arca-2026", "guest@example.com");
    const payload = await verifyEmailVerification(token);
    expect(payload!.exp).toBeGreaterThanOrEqual(before + 15 * 60);
    expect(payload!.exp).toBeLessThanOrEqual(before + 15 * 60 + 2);
  });

  it("rejects a tampered payload", async () => {
    const { token } = await signEmailVerification("arca-2026", "guest@example.com");
    const sig = token.slice(token.indexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ typ: "ev", eventSlug: "arca-2026", email: "victim@example.com", exp: 4102444800 }),
    ).toString("base64url");
    expect(await verifyEmailVerification(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { token } = await signEmailVerification("arca-2026", "guest@example.com");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    expect(await verifyEmailVerification(token)).toBeNull();
  });

  it("rejects junk", async () => {
    expect(await verifyEmailVerification("")).toBeNull();
    expect(await verifyEmailVerification(undefined)).toBeNull();
    expect(await verifyEmailVerification("no-dot")).toBeNull();
  });

  // Domain separation: the verification token travels in an emailed URL, so it
  // must never be usable as the identity cookie, and the long-lived cookie must
  // not pass as a verification token.
  it("is not interchangeable with an access grant", async () => {
    const { token: verification } = await signEmailVerification("arca-2026", "guest@example.com");
    expect(await verifyAccessGrant(verification)).toBeNull();

    const { token: grant } = await signAccessGrant("arca-2026", {
      email: "guest@example.com",
      personId: "p1",
      name: "Guest",
    });
    expect(await verifyEmailVerification(grant)).toBeNull();
  });
});
