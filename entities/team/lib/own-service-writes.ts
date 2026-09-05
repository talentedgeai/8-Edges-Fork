// The own-service write paths for /team, one branch per table so the
// table-ownership gate (scripts/check-table-ownership.mjs) sees every name:
// ideas and equipment_requests are company-os's and go through its writers;
// the rest are this entity's own. A table missing here cannot be written from
// /team, which is the point — reads are allowlisted in data.ts and writes are
// allowlisted here. Split out of data.ts by the 2026-09-05 bug-hunt fixes,
// which found the old `.from(table)` writes invisible to the gate.
import { companyOs } from "@/kernel/data/supabase";
import { insertEquipmentRequests, insertIdeas, updateIdeas } from "@/entities/company-os";

/** The tables /team may read through data.ts; the write switches below cover a subset. */
export type ScopedTable = "time_off" | "ideas" | "onboarding_plans" | "onboarding_tasks" | "equipment" | "equipment_requests";

type Row = Record<string, unknown>;

export function insertOwn(table: ScopedTable, row: Row) {
  switch (table) {
    case "ideas":
      return insertIdeas(row as Parameters<typeof insertIdeas>[0]);
    case "equipment_requests":
      return insertEquipmentRequests(row as Parameters<typeof insertEquipmentRequests>[0]);
    case "time_off":
      return companyOs.from("time_off").insert(row as never);
    default:
      throw new Error(`teamInsertOwn: '${table}' has no insert path from /team`);
  }
}

// Takes the row id and filters on it here, so the builder it returns is never
// an unfiltered write (scripts/entity-writers-filtered.test.mjs).
export function updateInScope(table: ScopedTable, id: string, patch: Row) {
  switch (table) {
    case "ideas":
      return updateIdeas(patch as Parameters<typeof updateIdeas>[0]).eq("id", id);
    case "time_off":
      return companyOs.from("time_off").update(patch as never).eq("id", id);
    case "onboarding_tasks":
      return companyOs.from("onboarding_tasks").update(patch as never).eq("id", id);
    default:
      throw new Error(`teamUpdateInScope: '${table}' has no update path from /team`);
  }
}
