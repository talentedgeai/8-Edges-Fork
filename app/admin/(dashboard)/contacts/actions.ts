"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { archiveRecord, guardedDelete, restoreRecord, type Result } from "@/lib/admin/mutations";
import { getPerson360, type Person360 } from "@/lib/admin/contacts";

// Lazy loader for the contacts list shelf — related data (companies, deals) is
// fetched on row open, never preloaded per row.
export async function getPersonShelf(id: string): Promise<Person360 | null> {
  await requireAdmin();
  return getPerson360(id);
}

export async function updatePerson(
  id: string,
  patch: {
    full_name?: string;
    phone?: string;
    persona?: string;
    country?: string;
    linkedin_url?: string;
    notes?: string;
    do_not_contact?: boolean;
  },
): Promise<Result> {
  const admin = await requireAdmin();
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  const { error } = await companyOs.from("people").update(clean).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "people", recordId: id, operation: "update", actor: admin.email, newData: patch });
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin/contacts");
  return { ok: true };
}

function refresh(id: string) {
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/revenue/leads");
}

// Archive: reversible soft-delete. The person leaves the working lists but the
// record and its history stay intact.
export async function archivePerson(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await archiveRecord("people", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

export async function restorePerson(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await restoreRecord("people", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

// Permanent erasure (GDPR right to be forgotten). Guarded by the schema's
// foreign keys: a person with orders/bookings/deals cannot be erased until those
// are cleared, and the attempt returns a clear message instead of a DB error.
export async function deletePerson(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await guardedDelete("people", id, admin.email, { via: "contact_360" });
  if (r.ok) {
    revalidatePath("/admin/contacts");
    revalidatePath("/admin/revenue/leads");
  }
  return r;
}
