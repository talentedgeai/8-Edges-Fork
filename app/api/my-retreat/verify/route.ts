import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { getEventBySlug } from "@/lib/events-server";
import {
  verifyEmailVerification,
  signAccessGrant,
  accessCookieOptions,
  MY_RETREAT_COOKIE,
} from "@/lib/my-retreat/access";

// GET /api/my-retreat/verify?token=… — the second half of the My Retreat email
// check. This is the ONLY place an identity-bearing grant (personId + the
// person's real name) is minted: /api/my-retreat/access mails the token, this
// route redeems it. Anything wrong with the token — bad signature, expired,
// retreat archived or renamed away, person no longer on file — lands back on
// the entry page with ?error=expired and sets no cookie. The failures are
// deliberately not distinguished: the redirect is reached by anyone holding a
// URL, so it must not report whether an address is in the CRM.

export const dynamic = "force-dynamic";

function expired(req: Request) {
  return NextResponse.redirect(new URL("/my-retreat?error=expired", req.url));
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const payload = await verifyEmailVerification(token);
  if (!payload) return expired(req);

  // The token only proves the address; the retreat and the person are looked
  // up fresh so a grant is never minted from stale embedded data.
  const event = await getEventBySlug(payload.eventSlug);
  if (!event) return expired(req);

  const { data: people, error } = await companyOs
    .from("people")
    .select("id, full_name")
    .ilike("email", payload.email)
    .limit(1);
  if (error) return expired(req);
  const person = (people ?? [])[0] as { id: string; full_name: string | null } | undefined;
  if (!person) return expired(req);

  const { token: grant, maxAgeSeconds } = await signAccessGrant(payload.eventSlug, {
    email: payload.email,
    personId: person.id,
    name: person.full_name ?? undefined,
  });
  const res = NextResponse.redirect(new URL(`/my-retreat/${payload.eventSlug}`, req.url));
  res.cookies.set(MY_RETREAT_COOKIE, grant, accessCookieOptions(maxAgeSeconds));
  return res;
}
