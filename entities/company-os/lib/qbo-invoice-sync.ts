import { companyOs } from "@/kernel/data/supabase";
import { listQboInvoices, type QboEntity, type QboSyncInvoice } from "@/entities/company-os/lib/qbo";

// Mirrors QuickBooks invoices into company_os.invoices for one company
// (entity). Read-from-QBO, upsert-into-Supabase; never deletes. The mirror is
// read-only in the app — QuickBooks is the source of truth.
//
// Customer -> company mapping is realm-aware and lives on company metadata:
//   entity 'edge8' -> companies.metadata.qbo_customer_ids
//   entity 'aio'   -> companies.metadata.qbo_customer_ids_aio
// A QBO customer with no mapped company is never guessed at: the invoice syncs
// with company_id null (customer_name still identifies it) and is reported as
// unmapped. Revenue therefore counts every invoice either way; mapping a
// customer later attaches its invoices on the next sync pass. AIO customers
// are mostly individuals, so most AIO invoices stay unmapped by design.

const MAPPING_KEY: Record<QboEntity, string> = {
  edge8: "qbo_customer_ids",
  aio: "qbo_customer_ids_aio",
};

// Sync only covers 2025 onward — matches the existing Edge8 backfill depth and
// the agreed AIO scope.
const SINCE = "2025-01-01";

export type UnmappedCustomer = { customerId: string; customerName: string | null; count: number };
export type InvoiceSyncResult = {
  entity: QboEntity;
  ok: boolean;
  error?: string;
  fetched: number;
  upserted: number;
  unmappedCount: number;
  unmapped: UnmappedCustomer[];
};

// QBO customer id -> our company_id, for one entity.
async function loadCustomerMap(entity: QboEntity): Promise<Map<string, string>> {
  const key = MAPPING_KEY[entity];
  const { data } = await companyOs
    .from("companies")
    .select("id, metadata")
    .not(`metadata->${key}`, "is", null);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; metadata: Record<string, unknown> }[]) {
    const ids = row.metadata?.[key];
    if (Array.isArray(ids)) for (const id of ids) map.set(String(id), row.id);
  }
  return map;
}

// Status the same way the ledger has always derived it: an explicit QBO void
// marker wins; otherwise a positive balance is overdue past its due date, else
// open; a zero balance is paid.
function deriveStatus(inv: QboSyncInvoice): string {
  if (inv.memo && /void/i.test(inv.memo)) return "voided";
  if (inv.balanceCents > 0) {
    if (inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10)) return "overdue";
    return "open";
  }
  return "paid";
}

export async function syncQboInvoices(entity: QboEntity): Promise<InvoiceSyncResult> {
  const base: InvoiceSyncResult = {
    entity,
    ok: false,
    fetched: 0,
    upserted: 0,
    unmappedCount: 0,
    unmapped: [],
  };

  const listed = await listQboInvoices(entity, SINCE);
  if (!listed.ok) return { ...base, error: listed.error };

  const customerMap = await loadCustomerMap(entity);
  const unmapped = new Map<string, UnmappedCustomer>();
  const rows: Record<string, unknown>[] = [];

  for (const inv of listed.invoices) {
    const companyId = inv.customerId ? customerMap.get(inv.customerId) : undefined;
    if (!companyId) {
      const k = inv.customerId ?? "unknown";
      const prev = unmapped.get(k);
      if (prev) prev.count++;
      else unmapped.set(k, { customerId: k, customerName: inv.customerName, count: 1 });
    }
    rows.push({
      company_id: companyId ?? null,
      source: "quickbooks",
      entity,
      external_id: inv.externalId,
      doc_number: inv.docNumber,
      txn_date: inv.txnDate,
      due_date: inv.dueDate,
      currency: inv.currency,
      amount_cents: inv.amountCents,
      balance_cents: inv.balanceCents,
      status: deriveStatus(inv),
      memo: inv.memo,
      customer_name: inv.customerName,
      lines: inv.lines,
      synced_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await companyOs
      .from("invoices")
      .upsert(rows, { onConflict: "source,entity,external_id" });
    if (error) return { ...base, error: error.message, fetched: listed.invoices.length };
  }

  return {
    entity,
    ok: true,
    fetched: listed.invoices.length,
    upserted: rows.length,
    unmappedCount: [...unmapped.values()].reduce((s, u) => s + u.count, 0),
    unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count),
  };
}
