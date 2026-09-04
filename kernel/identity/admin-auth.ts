// Server-only admin auth gate. NEVER import from a client component.
//
// A request is "admin" iff it carries a valid Supabase session AND the user's
// email is in the company_os.admins table (managed at /admin/settings/admins)
// OR in the ADMIN_ALLOWLIST env var (break-glass fallback so a bad delete in
// the UI can never lock everyone out). company_os has RLS ENABLED with no
// policies and no grants to the browser/publishable key, so that key can read
// nothing there; all data flows through the service-role client
// (lib/supabase.ts), which bypasses RLS. This gate — enforced in the admin
// layout and at the top of EVERY server action — is therefore the security
// boundary. (The /team portal uses the same service-role + gate pattern via
// requireTeamMember(); see lib/team-auth.ts.)

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/kernel/data/supabase/server";
import { companyOs } from "@/kernel/data/supabase";

export type AdminUser = { id: string; email: string };

// Emergency allowlist from the environment. Editing it requires a redeploy;
// day-to-day admin management lives in company_os.admins.
export function envAllowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// True if the email is an admin: env allowlist first (no DB hit), then the
// admins table. A DB error counts as "not in the table" — the env fallback is
// the recovery path, never an open door. Shared with the /team gate (admins
// have no /team identity) and portal provisioning (never invite an admin as
// an employee).
export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  if (envAllowlist().has(normalized)) return true;
  const { data, error } = await companyOs
    .from("admins")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    console.error("admins lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

// Returns the signed-in admin, or null if not signed in / not allowlisted.
//
// Revalidates the JWT against GoTrue on every call (auth.getUser, one network
// hop). This gate does NOT delegate authentication to middleware.
//
// It used to: it read the session locally with getSession() and relied on
// middleware.ts having already run auth.getUser(). getSession() performs no
// signature check — it decodes the cookie and returns whatever is in it — so
// that arrangement was only ever as strong as the middleware matcher. The
// matcher covers "/admin/:path*", "/team/:path*", "/portal/:path*" and does NOT
// cover /api, yet eight /api routes call these gates (admin chat, team chat,
// publish-editor, both QBO routes, the portal assistants, the conversation
// store). On those routes nothing revalidated the cookie, so a forged one was
// accepted — and lib/admin-chat/privileged.ts treats a single email address as
// the write-privileged user.
//
// Verifying here instead of upstream makes the guarantee local to the gate: it
// holds no matter which route calls it, and cannot be broken by editing a
// matcher in another file. The authoritative admins-table authorization check
// below is unchanged.
//
// Wrapped in React cache(): the admin layout, the page, and any server component
// that calls requireAdmin() during one render share a single resolve, so the
// revalidation is one network hop per request, not one per caller.
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email || !(await isAdminEmail(email))) return null;
  return { id: user.id, email };
});

// Server-side gate. Call at the top of the admin layout and every server action.
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return user;
}

// ── Sensitive-data gate (wages + PII) ──────────────────────────────────────
//
// Being an admin is NOT enough to see confidential data. Compensation, PII
// (people_sensitive, ID documents, bank details), and anything similarly
// restricted is gated to a smaller set — Dave and Mai — checked SERVER-SIDE so
// the data is never fetched for anyone else. Two sources, mirroring the admin
// gate: a SENSITIVE_VIEWERS env allowlist (break-glass; covers env-only admins
// like the owner, who has no admins row) checked first, then the
// admins.can_view_sensitive column. Do NOT reuse ADMIN_ALLOWLIST — every admin
// is in that.

export function sensitiveEnvAllowlist(): Set<string> {
  return new Set(
    (process.env.SENSITIVE_VIEWERS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// True if this email may view/edit wages and PII. Env allowlist first (no DB
// hit), then admins.can_view_sensitive. A DB error counts as "not cleared" —
// fail closed, never leak. Wrapped in cache() so one render resolves it once.
export const canViewSensitive = cache(async (email: string | null | undefined): Promise<boolean> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  if (sensitiveEnvAllowlist().has(normalized)) return true;
  const { data, error } = await companyOs
    .from("admins")
    .select("can_view_sensitive")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    console.error("sensitive-viewer lookup failed:", error.message);
    return false;
  }
  return Boolean(data?.can_view_sensitive);
});

// Convenience for server components/actions: the current admin plus whether
// they're cleared for sensitive data. Returns null if not signed in.
export async function getSensitiveViewer(): Promise<{ email: string; canViewSensitive: boolean } | null> {
  const user = await getAdminUser();
  if (!user) return null;
  return { email: user.email, canViewSensitive: await canViewSensitive(user.email) };
}

// ── Super admin gate ────────────────────────────────────────────────────────
//
// "Super admin" is the access-control name for the smallest, most-trusted admin
// set — currently Dave and Mai. It is the SAME set already cleared for sensitive
// data (wages + PII), so there is one source of truth: SENSITIVE_VIEWERS env +
// admins.can_view_sensitive, via canViewSensitive(). Being a plain admin (My,
// Quan) is not enough. Used to gate the ATS (recruiting: applications, job reqs,
// candidate pool) and employee compensation — the two together are what a super
// admin can see that a plain admin cannot.

export const isSuperAdmin = cache(async (email: string | null | undefined): Promise<boolean> => {
  return canViewSensitive(email);
});

// Server-side gate for super-admin-only surfaces. Call in the ATS route layouts
// and at the top of EVERY ATS server action (a layout does not protect action
// POSTs — the action gate is the real boundary). A signed-in admin who is not a
// super admin is bounced to the admin home rather than the login page.
export async function requireSuperAdmin(): Promise<AdminUser> {
  const user = await requireAdmin();
  if (!(await isSuperAdmin(user.email))) redirect("/admin");
  return user;
}
