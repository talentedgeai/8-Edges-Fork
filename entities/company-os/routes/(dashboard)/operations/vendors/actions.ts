"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import { archiveRecord, restoreRecord, type Result } from "@/entities/company-os/lib/mutations";
import { VENDOR_RATINGS, VENDOR_TYPES, type VendorType } from "./vendor-shared";

function validRating(rating: string | undefined): boolean {
  return rating === undefined || rating.trim() === "" || (VENDOR_RATINGS as readonly string[]).includes(rating);
}

export type VendorInput = {
  type: VendorType;
  name: string;
  price_range?: string;
  address?: string;
  phone?: string;
  tax_id?: string;
  bank_info?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  secondary_contact_name?: string;
  secondary_contact_email?: string;
  secondary_contact_phone?: string;
  rating?: string;
  url?: string;
  notes?: string;
};

function refresh() {
  revalidatePath("/admin/operations/vendors");
}

// Empty strings become null so cleared fields don't persist as "".

export async function createVendor(input: VendorInput): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Vendor name is required." };
  if (!VENDOR_TYPES.includes(input.type)) return { ok: false, error: "Invalid vendor type." };
  if (!validRating(input.rating)) return { ok: false, error: "Invalid rating." };

  const row = { ...toPatch(input), name, type: input.type };
  const { data, error } = await companyOs.from("vendors").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "vendors", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateVendor(id: string, patch: Partial<VendorInput>): Promise<Result> {
  const admin = await requireAdmin();

  if (patch.type !== undefined && !VENDOR_TYPES.includes(patch.type)) {
    return { ok: false, error: "Invalid vendor type." };
  }
  if (!validRating(patch.rating)) return { ok: false, error: "Invalid rating." };
  const updates = { ...toPatch(patch), updated_at: new Date().toISOString() };
  if ("name" in updates && !updates.name) {
    return { ok: false, error: "Vendor name can't be empty." };
  }

  const { error } = await companyOs.from("vendors").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "vendors", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

export async function archiveVendor(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await archiveRecord("vendors", id, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function restoreVendor(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await restoreRecord("vendors", id, admin.email);
  if (r.ok) refresh();
  return r;
}
