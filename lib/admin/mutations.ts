import type { PostgrestError } from "@supabase/supabase-js";
import { companyOs } from "@/lib/supabase";
import { recordAudit } from "./audit";

// Generic archive / restore / guarded-delete for the archivable CRM tables
// (people, companies, deals, vendors). Each writes the audit trail; callers handle
// revalidatePath and any entity-specific side effects. Archive is the safe,
// reversible default; guardedDelete is the GDPR-style hard erasure.

export type Result = { ok: true } | { ok: false; error: string };

export type ArchivableTable = "people" | "companies" | "deals" | "vendors";

// Friendlier names for the relations that can block a hard delete.
const REL_LABEL: Record<string, string> = {
  orders: "orders",
  bookings: "bookings",
  deals: "deals",
  subscriptions: "subscriptions",
  inquiries: "inquiries",
  event_registrations: "event registrations",
  meeting_participants: "meeting history",
  touchpoints: "touchpoints",
  affiliates: "affiliate records",
  applications: "applications",
  job_requisitions: "job requisitions",
  lifecycle_transitions: "lifecycle transitions",
  projects: "projects",
  candidates: "a candidate profile",
  tasks: "tasks",
};

// Turn a Postgres FK violation into a message that names the blocking relation.
function fkMessage(error: PostgrestError): string {
  const src = `${error.details ?? ""} ${error.message ?? ""}`;
  const m = /table "([^"]+)"/.exec(src);
  const raw = m?.[1];
  const rel = raw ? REL_LABEL[raw] ?? raw.replace(/_/g, " ") : "other records";
  return `Can't permanently delete: still referenced by ${rel}. Archive it instead, or clear the ${rel} first.`;
}

export async function archiveRecord(
  table: ArchivableTable,
  id: string,
  actor: string | null,
): Promise<Result> {
  const { error } = await companyOs
    .from(table)
    .update({ archived_at: new Date().toISOString(), archived_by: actor })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table, recordId: id, operation: "archive", actor });
  return { ok: true };
}

export async function restoreRecord(
  table: ArchivableTable,
  id: string,
  actor: string | null,
): Promise<Result> {
  const { error } = await companyOs
    .from(table)
    .update({ archived_at: null, archived_by: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table, recordId: id, operation: "restore", actor });
  return { ok: true };
}

// Hard delete, guarded by the schema's own foreign keys. On a 23503 violation
// we surface which relation blocks it rather than a raw DB error. No PII is
// copied into the audit row; it records the erasure event and the actor only.
export async function guardedDelete(
  table: ArchivableTable,
  id: string,
  actor: string | null,
  context?: Record<string, unknown>,
): Promise<Result> {
  const { error } = await companyOs.from(table).delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { ok: false, error: fkMessage(error) };
    return { ok: false, error: error.message };
  }
  await recordAudit({ table, recordId: id, operation: "delete", actor, context });
  return { ok: true };
}
