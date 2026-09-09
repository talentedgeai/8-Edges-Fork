// Signed, server-trusted "My Retreat" access grant.
//
// Entering a private retreat's access code (events.metadata.access_code) mints
// this HMAC-signed cookie, which authorizes VIEWING that retreat's guest hub
// (/my-retreat/<slug>). It is NOT a login and confers no identity or protected
// data access — it only unlocks marketing content and carries the guest's email
// + resolved person_id so the survey links attribute without re-asking.
//
// Ported from the infinite-leverage access-grant (src/lib/access-grant.ts); the
// signing core now lives in lib/signed-token.ts, shared with lib/access-gate.ts.
// Server-only (imports the service-role client).
//
// Design: docs/plans/2026-07-31-my-retreat-design.md

import { companyOs } from "@/kernel/data/supabase";
import { nowSeconds, signToken, signedCookieOptions, verifyToken, type SigningKey } from "@/kernel/identity/signed-token";

export const MY_RETREAT_COOKIE = "edge8_my_retreat";

// Prefer a dedicated secret; fall back to the server-only Supabase secret so a
// missing MY_RETREAT_COOKIE_SECRET never breaks a deploy. Both are server-only.
function secret(): string {
  const s = process.env.MY_RETREAT_COOKIE_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("MY_RETREAT_COOKIE_SECRET (or SUPABASE_SECRET_KEY) must be set");
  return s;
}

// The two token families share one secret and are domain-separated by purpose.
// The access grant keeps the empty purpose so cookies already in the wild stay
// valid; the emailed verification token signs over a distinct prefix, so a
// token from one family can never be replayed as the other.
function grantKey(): SigningKey {
  return { secret: secret() };
}
function emailVerificationKey(): SigningKey {
  return { secret: secret(), purpose: "my-retreat:email-verify:" };
}

const DEFAULT_TTL_SECONDS = 120 * 24 * 60 * 60; // 120 days

interface AccessGrant {
  eventSlug: string;
  exp: number; // epoch seconds
  email?: string;
  personId?: string;
  name?: string;
}

export async function signAccessGrant(
  eventSlug: string,
  identity?: { email?: string | null; personId?: string | null; name?: string | null },
): Promise<{ token: string; maxAgeSeconds: number }> {
  const grant: AccessGrant = { eventSlug, exp: nowSeconds() + DEFAULT_TTL_SECONDS };
  if (identity?.email) grant.email = identity.email;
  if (identity?.personId) grant.personId = identity.personId;
  if (identity?.name) grant.name = identity.name;
  return { token: await signToken(grant, grantKey()), maxAgeSeconds: DEFAULT_TTL_SECONDS };
}

// Verify signature + expiry. Returns the grant or null.
export async function verifyAccessGrant(token: string | undefined | null): Promise<AccessGrant | null> {
  return verifyToken<AccessGrant>(token, grantKey(), (p) => {
    if (!p || typeof p !== "object") return null;
    const g = p as Partial<AccessGrant>;
    if (typeof g.eventSlug !== "string" || typeof g.exp !== "number") return null;
    return g as AccessGrant;
  });
}

// ---------------------------------------------------------------------------
// Email verification
//
// Knowing a client's address must not be enough to wear their identity, so the
// access route no longer mints an identity-bearing grant straight from a typed
// email. It signs one of these instead and mails the link; only
// /api/my-retreat/verify turns it back into a grant. Stateless (no table): the
// short TTL, not a server-side record, is what bounds the replay window.

export const EMAIL_VERIFICATION_TTL_SECONDS = 15 * 60;

interface EmailVerification {
  typ: "ev";
  eventSlug: string;
  email: string;
  exp: number; // epoch seconds
}

export async function signEmailVerification(
  eventSlug: string,
  email: string,
): Promise<{ token: string; ttlSeconds: number }> {
  const payload: EmailVerification = {
    typ: "ev",
    eventSlug,
    email: email.trim().toLowerCase(),
    exp: nowSeconds() + EMAIL_VERIFICATION_TTL_SECONDS,
  };
  return {
    token: await signToken(payload, emailVerificationKey()),
    ttlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
  };
}

// Verify signature + expiry. Returns the payload or null. Never throws on
// malformed input — the token arrives from a URL query string.
export async function verifyEmailVerification(
  token: string | undefined | null,
): Promise<EmailVerification | null> {
  return verifyToken<EmailVerification>(token, emailVerificationKey(), (p) => {
    if (!p || typeof p !== "object") return null;
    const v = p as Partial<EmailVerification>;
    if (v.typ !== "ev") return null;
    if (typeof v.eventSlug !== "string" || !v.eventSlug) return null;
    if (typeof v.email !== "string" || !v.email) return null;
    if (typeof v.exp !== "number") return null;
    return v as EmailVerification;
  });
}

export const accessCookieOptions = signedCookieOptions;

interface ResolvedRetreat {
  eventId: string;
  slug: string;
  title: string;
}

// Resolve a typed access code to its retreat via events.metadata.access_code.
// Exact match (codes are case-sensitive), non-archived only. Server-only.
export async function resolveAccessCode(rawCode: string): Promise<ResolvedRetreat | null> {
  const code = (rawCode || "").trim();
  if (!code) return null;
  const { data, error } = await companyOs
    .from("events")
    .select("id, slug, title")
    .eq("metadata->>access_code", code)
    .is("archived_at", null)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const e = data[0] as { id: string; slug: string; title: string };
  return { eventId: e.id, slug: e.slug, title: e.title };
}
