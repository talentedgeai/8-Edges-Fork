"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signOutTo } from "@/kernel/identity/session";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { ASSUME_COOKIE } from "@/kernel/identity/portal-auth";
import { updatePortalAssumeSessions } from "@/kernel/identity/writes";

// Sign the client contact out and return them to the portal login.
export async function signOut() {
  await signOutTo("/portal/login");
}

// Ends an Assume session (the "Exit" control on the impersonation banner, and
// the sidebar's sign-out button while impersonating — see PortalSidebar).
// requireAdmin() checks the admin's REAL Supabase session, which was never
// touched by starting the Assume session, so this correctly identifies the
// admin regardless of which client identity /portal is currently rendering.
export async function endAssumeSession() {
  const admin = await requireAdmin();
  const sessionId = cookies().get(ASSUME_COOKIE)?.value;
  if (sessionId) {
    await updatePortalAssumeSessions({ ended_at: new Date().toISOString(), ended_by: "admin" })
      .eq("id", sessionId)
      .eq("started_by", admin.email)
      .is("ended_at", null);
    await recordAudit({
      table: "portal_assume_sessions",
      recordId: sessionId,
      operation: "update",
      actor: admin.email,
      context: { action: "assume_end" },
    });
  }
  cookies().delete(ASSUME_COOKIE);
  redirect("/admin");
}
