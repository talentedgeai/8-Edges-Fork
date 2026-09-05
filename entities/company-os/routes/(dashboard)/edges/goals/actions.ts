"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import { type Result } from "@/entities/company-os/lib/mutations";
import {
  BRANDS,
  DELIVERY_MIXES,
  KR_STATUSES,
  OBJECTIVE_LEVELS,
  OFFICES,
  type DeliveryMix,
  type KrStatus,
  type ObjectiveLevel,
} from "@/entities/company-os/lib/company/edges-shared";

function refresh() {
  revalidatePath("/admin/edges/goals");
}

// Empty strings become null so cleared fields don't persist as "".

export type ObjectiveInput = {
  level: ObjectiveLevel;
  title: string;
  office?: string;
  brand?: string;
  parent_kr_id?: string;
  quarter: string;
  strategy_id?: string;
  owner_agent?: string;
  sort_order?: number;
};

export async function createObjective(input: ObjectiveInput): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Objective title is required." };
  if (!OBJECTIVE_LEVELS.includes(input.level)) return { ok: false, error: "Invalid level." };
  if (input.level !== "company" && !input.parent_kr_id) {
    return { ok: false, error: "Pick the parent key result this objective serves. Only company objectives may float free." };
  }
  if (input.level === "office" && !OFFICES.includes(input.office as (typeof OFFICES)[number])) {
    return { ok: false, error: "Pick which office owns this objective." };
  }
  if (input.brand && !BRANDS.includes(input.brand as (typeof BRANDS)[number])) {
    return { ok: false, error: "Invalid brand." };
  }

  const row = {
    ...toPatch({ ...input }),
    title,
    office: input.level === "office" ? input.office : null,
    parent_kr_id: input.level === "company" ? null : input.parent_kr_id,
  };
  const { data, error } = await companyOs.from("objectives").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "objectives", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateObjective(
  id: string,
  patch: { title?: string; status?: string; brand?: string; owner_agent?: string },
): Promise<Result> {
  const admin = await requireAdmin();
  if (patch.title !== undefined && !patch.title.trim()) {
    return { ok: false, error: "Objective title can't be empty." };
  }
  const updates = { ...toPatch(patch), updated_at: new Date().toISOString() };
  const { error } = await companyOs.from("objectives").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "objectives", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

export type KrInput = {
  objective_id: string;
  title: string;
  target_value?: number | null;
  unit?: string;
  direction?: "up" | "down";
  delivery_mix: DeliveryMix;
  accountable_person_id: string;
  executing_agent?: string;
  sort_order?: number;
};

export async function createKr(input: KrInput): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Key result title is required." };
  if (!DELIVERY_MIXES.includes(input.delivery_mix)) return { ok: false, error: "Invalid delivery mix." };
  if (!input.accountable_person_id) {
    return { ok: false, error: "Every key result needs one accountable human." };
  }
  if ((input.delivery_mix === "ai" || input.delivery_mix === "blended") && !input.executing_agent) {
    return { ok: false, error: "An AI-led or blended key result needs its executing agent named." };
  }

  const row = { ...toPatch({ ...input }), title };
  const { data, error } = await companyOs.from("key_results").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "key_results", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateKr(id: string, patch: Partial<Omit<KrInput, "objective_id">>): Promise<Result> {
  const admin = await requireAdmin();
  if (patch.title !== undefined && !patch.title.trim()) {
    return { ok: false, error: "Key result title can't be empty." };
  }
  if (patch.delivery_mix !== undefined && !DELIVERY_MIXES.includes(patch.delivery_mix)) {
    return { ok: false, error: "Invalid delivery mix." };
  }
  const updates = { ...toPatch(patch), updated_at: new Date().toISOString() };
  const { error } = await companyOs.from("key_results").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "key_results", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

export async function checkInKr(id: string, input: { current_value: number; status: KrStatus }): Promise<Result> {
  const admin = await requireAdmin();
  if (!KR_STATUSES.includes(input.status)) return { ok: false, error: "Invalid status." };
  if (!Number.isFinite(input.current_value)) return { ok: false, error: "Enter a number for the current value." };

  const updates = {
    current_value: input.current_value,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  const { error } = await companyOs.from("key_results").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "key_results", recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}
