import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import { getSiteOrigin } from "@/lib/site-origin";
import {
  resolveAccessCode,
  signAccessGrant,
  signEmailVerification,
  accessCookieOptions,
  MY_RETREAT_COOKIE,
} from "@/lib/my-retreat/access";
import { escapeHtml } from "@/lib/html";

// POST { code }                                  → validate the retreat code (no cookie yet).
// POST { code, registration: { email } }         → returning: known client — email a
//                                                  verification link, mint nothing here.
// POST { code, registration: { email, name } }   → first-time: unlock with the given name.
//
// The identity-bearing half of this flow is deliberately asymmetric. A grant
// carrying `personId` (survey attribution, the guest's real name) is only ever
// minted by /api/my-retreat/verify, after the guest proves control of the
// address — otherwise knowing a client's email would be enough to act as them.
// The unknown-email path claims no identity, so it still unlocks in place.

interface RegistrationInput {
  email?: string;
  name?: string;
}
interface RequestBody {
  code?: string;
  registration?: RegistrationInput;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The retreat title comes from the events row, so it is escaped rather than
// trusted even though only admins can write it.
function verificationEmailHtml(retreatTitle: string, link: string): string {
  const title = escapeHtml(retreatTitle);
  const href = escapeHtml(link);
  return `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
      <p>Confirm your email to open <strong>${title}</strong>.</p>
      <p><a href="${href}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111;color:#fff;text-decoration:none">Open My Retreat</a></p>
      <p style="opacity:0.7;font-size:13px">This link expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p>
    </div>
  `;
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const retreat = await resolveAccessCode(body.code ?? "");
  if (!retreat) {
    return NextResponse.json({ ok: false, error: "That access code isn't recognized." }, { status: 401 });
  }

  // Step 1: code valid — ask who they are before unlocking.
  if (!body.registration) {
    return NextResponse.json({ ok: true, retreat: { title: retreat.title } });
  }

  // Step 2: unlock.
  const email = (body.registration.email || "").trim().toLowerCase();
  const name = (body.registration.name || "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  // Match an existing client by email ("continue as a Client").
  const { data: people, error } = await companyOs
    .from("people")
    .select("id, full_name")
    .ilike("email", email)
    .limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't verify that email right now." }, { status: 500 });
  }
  const person = (people ?? [])[0] as { id: string; full_name: string | null } | undefined;

  // Known email → the grant would carry this person's identity, so it has to be
  // earned. Mail a 15-minute link and set nothing.
  if (person) {
    const { token: verifyToken } = await signEmailVerification(retreat.slug, email);
    const link = `${getSiteOrigin()}/api/my-retreat/verify?token=${encodeURIComponent(verifyToken)}`;
    await sendTransactionalEmail({
      to: email,
      subject: `Your link to ${retreat.title}`,
      html: verificationEmailHtml(retreat.title, link),
      // The link is a bearer credential — keep it out of the CRM interactions log.
      logBody: `<p>My Retreat verification link sent for ${escapeHtml(retreat.title)} (link omitted).</p>`,
      logMeta: { source: "my-retreat-verification", event_slug: retreat.slug },
    });
    return NextResponse.json({ ok: true, verificationSent: true });
  }

  // Unknown email → first-time: require a name. No identity is being claimed,
  // so this path is unchanged.
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "We don't have that email on file — add your name to continue.", needName: true },
      { status: 404 },
    );
  }
  const { token, maxAgeSeconds } = await signAccessGrant(retreat.slug, { email, name });
  const res = NextResponse.json({ ok: true, redirect: `/my-retreat/${retreat.slug}` });
  res.cookies.set(MY_RETREAT_COOKIE, token, accessCookieOptions(maxAgeSeconds));
  return res;
}
