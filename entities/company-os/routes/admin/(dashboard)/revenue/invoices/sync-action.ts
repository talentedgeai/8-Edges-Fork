"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requireRevenueAccess } from "@/kernel/identity/revenue-access";
import { syncQboInvoices } from "@/entities/company-os/lib/qbo-invoice-sync";
import type { QboEntity } from "@/entities/company-os/lib/qbo";

// Admin-triggered "Sync now": pulls both QuickBooks companies into the ledger.
// Same engine the weekly cron runs. Returns a per-entity summary for the UI.
export type SyncSummary = {
  entity: QboEntity;
  ok: boolean;
  error?: string;
  fetched: number;
  upserted: number;
  unmappedCount: number;
};

export async function runInvoiceSync(): Promise<SyncSummary[]> {
  await requireRevenueAccess();
  const entities: QboEntity[] = ["edge8", "aio"];
  const out: SyncSummary[] = [];
  for (const entity of entities) {
    const r = await syncQboInvoices(entity);
    out.push({
      entity: r.entity,
      ok: r.ok,
      error: r.error,
      fetched: r.fetched,
      upserted: r.upserted,
      unmappedCount: r.unmappedCount,
    });
  }
  revalidateSurfaces("/revenue/invoices");
  return out;
}
