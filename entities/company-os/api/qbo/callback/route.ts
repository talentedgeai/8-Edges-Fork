import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { exchangeQboCode } from "@/entities/company-os/lib/qbo";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Intuit OAuth callback: verifies the state cookie, exchanges the code for
// tokens, and stores the connection (company_os.qbo_connection). Admin-only —
// the admin who clicked Connect is still signed in here.
export async function GET(request: Request) {
  const settingsUrl = (status: string) =>
    NextResponse.redirect(`${getSiteOrigin()}/admin/settings/quickbooks?status=${status}`);

  const admin = await getAdminUser();
  if (!admin) return NextResponse.redirect(`${getSiteOrigin()}/admin/login`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");

  const cookieState = cookies().get("qbo_oauth_state")?.value;
  const entity = cookies().get("qbo_oauth_entity")?.value === "aio" ? "aio" : "edge8";
  cookies().delete("qbo_oauth_state");
  cookies().delete("qbo_oauth_entity");
  if (!state || !cookieState || state !== cookieState) return settingsUrl("state_mismatch");
  if (!code || !realmId) return settingsUrl("missing_code");

  const result = await exchangeQboCode(code, realmId, admin.email, entity);
  if (!result.ok) {
    console.error("[qbo/callback] exchange failed:", result.error);
    return settingsUrl("error");
  }

  await recordAudit({
    table: "qbo_connection",
    recordId: entity,
    operation: "update",
    actor: admin.email,
    newData: { realm_id: realmId },
    context: { kind: "qbo_connect" },
  });
  return settingsUrl("connected");
}
