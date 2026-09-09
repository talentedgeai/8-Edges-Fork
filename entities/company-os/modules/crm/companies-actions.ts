"use server";

import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
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

  const updates: CompanyOsUpdate<"companies"> = {
    updated_at: new Date().toISOString(),
    // Same conversion the loop used to do inline (drop `undefined`, blank
    // string to null); toPatch is the kernel copy, and keeps the key names
    // typed against the `companies` columns now that the client is typed.
    ...toPatch(patch),
  };
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
