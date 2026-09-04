"use server";

import { revalidatePath } from "next/cache";
import { companyOs, supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { findAdminEmployee, findAuthUser } from "@/lib/admin/admins";
import { getSiteOrigin } from "@/lib/site-origin";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/settings/admins");
}

// Send the right email for the account's state: no login yet → Supabase invite
// (creates the auth user, link lets them set a password); existing login →
// password reset. These are generated server-side, so the link comes back via
// the implicit flow with the session in the URL hash (#access_token=…). Land
// straight on /admin/reset-password (which reads the hash) — NOT
// /api/auth/callback, which only handles the PKCE ?code= flow used by the
// browser-initiated login "forgot password" form.
async function sendAccessEmail(email: string): Promise<Result> {
  const redirectTo = `${getSiteOrigin()}/admin/reset-password`;
  const existing = await findAuthUser(email);
  if (existing) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { ok: false, error: `Reset email failed: ${error.message}` };
    return { ok: true, message: `Password reset link sent to ${email}.` };
  }
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) return { ok: false, error: `Invite failed: ${error.message}` };
  return { ok: true, message: `Invite sent to ${email}.` };
}

// Admins are granted to employees, never free-typed emails. The client sends
// the chosen person's id and the level; email + name are re-resolved from the
// people record server-side, and eligibility (on payroll, not a contractor,
// not already an admin) is re-checked here — findAdminEmployee returns null
// otherwise.
export async function addAdmin(personId: string, canViewSensitive: boolean): Promise<Result> {
  const admin = await requireAdmin();

  const employee = await findAdminEmployee(personId);
  if (!employee) {
    return { ok: false, error: "Pick an active employee from the list (contractors and current admins are excluded)." };
  }
  const email = employee.email; // already normalized lowercase
  const displayName = employee.name;

  const { data: row, error } = await companyOs
    .from("admins")
    .insert({
      email,
      display_name: displayName,
      person_id: personId,
      can_view_sensitive: canViewSensitive,
      created_by: admin.email,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: row.id,
    operation: "insert",
    actor: admin.email,
    newData: { email, display_name: displayName, person_id: personId, can_view_sensitive: canViewSensitive },
  });

  const sent = await sendAccessEmail(email);
  refresh();
  if (!sent.ok) {
    // Access is already granted; only the email failed. Surface that precisely.
    return {
      ok: true,
      message: `${email} added, but the email could not be sent (${sent.error}). They can use "Forgot password" on the login page.`,
    };
  }
  return { ok: true, message: `${email} added. ${sent.message}` };
}

// Edits the display name and the level (Super Admin => can_view_sensitive).
// Email is no longer editable here: it's the linked employee's login address,
// kept in sync with the people record rather than typed by hand.
export async function updateAdmin(
  id: string,
  fields: { displayName: string; canViewSensitive: boolean },
): Promise<Result> {
  const admin = await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("admins")
    .select("id, email, display_name, can_view_sensitive")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Admin not found." };

  const displayName = fields.displayName.trim() || null;
  const canViewSensitive = fields.canViewSensitive;

  const { error } = await companyOs
    .from("admins")
    .update({ display_name: displayName, can_view_sensitive: canViewSensitive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: { display_name: row.display_name, can_view_sensitive: row.can_view_sensitive },
    newData: { display_name: displayName, can_view_sensitive: canViewSensitive },
  });
  refresh();
  return { ok: true, message: "Admin updated." };
}

export async function resendAccessLink(id: string): Promise<Result> {
  await requireAdmin();
  const { data: row, error } = await companyOs
    .from("admins")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Admin not found." };
  const sent = await sendAccessEmail(row.email);
  refresh();
  return sent;
}

// Revokes /admin access immediately (the gate checks this table per request).
// The Supabase login itself is kept — it may be re-granted or, later, hold a
// /team identity. Removal is what the audit trail records.
export async function deleteAdmin(id: string): Promise<Result> {
  const admin = await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("admins")
    .select("id, email, display_name")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Admin not found." };
  if (row.email.toLowerCase() === admin.email) {
    return { ok: false, error: "You can't remove yourself — ask another admin." };
  }

  const { error } = await companyOs.from("admins").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    oldData: { email: row.email, display_name: row.display_name },
  });
  refresh();
  return { ok: true, message: `${row.email} no longer has admin access.` };
}
