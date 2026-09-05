"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { archiveRecord, guardedDelete, restoreRecord, type Result } from "@/entities/company-os/lib/mutations";

export type CompanyPatch = {
  name?: string;
  website_url?: string;
  industry?: string;
  industry_normalized?: string;
  size_band?: string;
  country?: string;
  priority?: string;
  notes?: string;
};

function refresh(id?: string) {
  revalidatePath("/admin/revenue/companies");
  if (id) revalidatePath(`/admin/revenue/companies/${id}`);
}

export async function updateCompany(id: string, patch: CompanyPatch): Promise<Result> {
  const admin = await requireAdmin();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    updates[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if ("name" in updates && !updates.name) {
    return { ok: false, error: "Company name can't be empty." };
  }

  const { error } = await companyOs.from("companies").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "companies", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh(id);
  return { ok: true };
}

export async function archiveCompany(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await archiveRecord("companies", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

export async function restoreCompany(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await restoreRecord("companies", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

// Guarded by the schema's foreign keys: a company that still has deals, job
// requisitions or projects can't be erased until those are cleared.
export async function deleteCompany(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await guardedDelete("companies", id, admin.email, { via: "companies" });
  if (r.ok) refresh();
  return r;
}
