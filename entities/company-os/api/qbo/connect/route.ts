import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { buildQboAuthUrl, qboConfigured } from "@/entities/company-os/lib/qbo";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Starts the QuickBooks OAuth flow (admin-only). The random state lands in an
// httpOnly cookie and is verified by /api/qbo/callback — standard CSRF guard.
// ?entity=edge8|aio picks which company this connection is for; it rides
// through the round-trip in a cookie (Intuit only echoes `state`).
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.redirect(`${getSiteOrigin()}/admin/login`);
  if (!qboConfigured()) {
    return NextResponse.redirect(`${getSiteOrigin()}/admin/settings/quickbooks?status=unconfigured`);
  }

  const entity = new URL(request.url).searchParams.get("entity") === "aio" ? "aio" : "edge8";

  const state = crypto.randomUUID();
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 10 * 60 };
  cookies().set("qbo_oauth_state", state, cookieOpts);
  cookies().set("qbo_oauth_entity", entity, cookieOpts);
  return NextResponse.redirect(buildQboAuthUrl(state));
}
