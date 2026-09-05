// Server-only. Self-serve magic-link sign-in for the /admin Company OS, from the
// /admin/login page (no session). The admin mirror of lib/team/signin-link.ts:
// mint the token server-side and email a link to /admin/verify, which only
// redeems the token_hash on a button press, so corporate mail security
// (Microsoft Safe Links et al) can't prefetch and consume it first.
//
// Anti-abuse, mirroring team/portal: emails only go to auth users on the admin
// allowlist (isAdminEmail, the same gate requireAdmin enforces), the
// caller-facing result is always neutral (no account enumeration), and repeat
// requests for the same email are throttled. The throttle map is per serverless
// instance, best-effort; the allowlist gate is the real limiter.

import { PALETTE } from "@/kernel/config/palette";
import { supabase } from "@/kernel/data/supabase";
import { isAdminEmail } from "@/kernel/identity/admin-auth";
import { findAuthUserByEmail, bannedUntil } from "@/entities/company-os/modules/crm/portal-invite";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { mintVerifyLink } from "@/kernel/identity/session";
import { sendTransactionalEmail } from "@/kernel/messaging/email";

const SELF_SERVE_COOLDOWN_MS = 60_000;
const lastSelfServeSend = new Map<string, number>();

function throttled(key: string): boolean {
  const now = Date.now();
  const last = lastSelfServeSend.get(key) ?? 0;
  if (now - last < SELF_SERVE_COOLDOWN_MS) return true;
  lastSelfServeSend.set(key, now);
  return false;
}

// The auth user for `email`, but only when they are on the admin allowlist and
// not banned; null (silently) otherwise.
async function activeAdminAuthUser(email: string): Promise<{ id: string } | null> {
  if (!(await isAdminEmail(email))) return null;
  const user = await findAuthUserByEmail(email);
  if (!user) return null;
  const { data: fullUser } = await supabase.auth.admin.getUserById(user.id);
  if (!fullUser?.user || bannedUntil(fullUser.user)) return null;
  return { id: user.id };
}

// Self-serve "Email me a sign-in link". Always resolves; the login page shows the
// same neutral notice whether or not an email went out.
export async function sendAdminSelfServeSignInLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || throttled(email)) return;
  if (!(await activeAdminAuthUser(email))) return;

  const link = await mintVerifyLink({
    type: "magiclink",
    email,
    redirectTo: "/api/auth/callback?next=/admin",
    verifyPath: "/admin/verify",
  });
  if ("error" in link) return;
  const { verifyUrl } = link;

  await sendTransactionalEmail({
    to: email,
    subject: "Your 8 Edges Company OS sign-in link",
    html: `
      <p>Here is your sign-in link for the 8 Edges Company OS:</p>
      <p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Sign in to the Company OS</a></p>
      <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a sign-in page. Press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${getSiteOrigin()}/admin/login">${getSiteOrigin()}/admin/login</a>.</p>
    `,
    logMeta: { source: "admin_self_serve_link" },
  });
}
