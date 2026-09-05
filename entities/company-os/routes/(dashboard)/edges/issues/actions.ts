"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/entities/company-os/lib/mutations";
import { ISSUE_DIAGNOSES, ISSUE_STATUSES } from "@/entities/company-os/lib/company/edges-shared";

function refresh() {
  revalidatePath("/admin/edges/issues");
  revalidatePath("/admin/edges/goals");
}

export async function createIssue(input: {
  title: string;
  diagnosis: string;
  assignee_person_id: string;
  key_result_id?: string;
  notes_md?: string;
}): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Say what the issue is." };
  if (!ISSUE_DIAGNOSES.includes(input.diagnosis as (typeof ISSUE_DIAGNOSES)[number])) {
    return { ok: false, error: "Diagnose it first: goal problem, system problem, or execution problem." };
  }
  if (!input.assignee_person_id) return { ok: false, error: "Assign it to a person." };

  const row = {
    title,
    diagnosis: input.diagnosis,
    assignee_person_id: input.assignee_person_id,
    key_result_id: input.key_result_id || null,
    notes_md: input.notes_md?.trim() || null,
    filed_by: admin.email,
  };
  const { data, error } = await companyOs.from("issues").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function setIssueStatus(id: string, status: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }
  const updates: Record<string, unknown> = { status };
  updates.resolved_at = status === "solved" || status === "dropped" ? new Date().toISOString() : null;

  const { error } = await companyOs.from("issues").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

export async function setIssueAssignee(id: string, personId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!personId) return { ok: false, error: "Assign it to a person." };
  const updates = { assignee_person_id: personId };
  const { error } = await companyOs.from("issues").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}
