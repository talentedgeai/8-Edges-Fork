"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { runDayoffImport, type ImportReport } from "@/lib/dayoff/import";

type Result = { ok: true; report: ImportReport } | { ok: false; error: string };

// Admin-triggered Day Off import. Read-only against Day Off (GETs only);
// idempotent against company_os (provenance keys), so re-running is safe.
export async function runImport(): Promise<Result> {
  await requireAdmin();
  const res = await runDayoffImport();
  if (res.ok) {
    revalidatePath("/admin/operations/time-off/requests");
    revalidatePath("/admin/operations/time-off/import");
  }
  return res;
}
