import { companyOs } from "@/kernel/data/supabase";

// Append-only audit trail for admin write actions on CRM records. Best-effort:
// a failed audit insert is logged but never blocks the user-facing mutation
// (mirrors recordTransition). company_os.audit_log fills id, context ({}) and
// changed_at (now()) server-side, so a row only needs table_name + operation.
//
// GDPR note: for `delete` we deliberately do NOT copy PII into old_data — the
// row records *that* an erasure happened and *who* did it, not the erased data.

export type AuditOp =
  | "insert"
  | "update"
  | "archive"
  | "restore"
  | "delete"
  | "bulk_update"
  | "bulk_archive"
  | "bulk_delete";

export type AuditInput = {
  table: string;
  recordId?: string | null;
  operation: AuditOp;
  actor?: string | null; // admin email from requireAdmin()
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
};

function toRow(input: AuditInput) {
  return {
    actor_label: input.actor ?? null,
    table_name: input.table,
    record_id: input.recordId ?? null,
    operation: input.operation,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
    context: input.context ?? {},
  };
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const { error } = await companyOs.from("audit_log").insert(toRow(input));
  if (error) console.error("audit_log insert failed:", error.message);
}

export async function recordAuditMany(inputs: AuditInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const { error } = await companyOs.from("audit_log").insert(inputs.map(toRow));
  if (error) console.error("audit_log batch insert failed:", error.message);
}
