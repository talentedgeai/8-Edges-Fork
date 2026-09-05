import { companyOs } from "@/kernel/data/supabase";

// Reads for company_os.invoices (synced from QuickBooks) and the
// company -> QBO-customer mapping stored on companies.metadata.qbo_customer_ids.
// Admin surfaces only; /portal reads through entities/portal/lib/invoices.ts instead
// (which never selects `memo`).

export type AdminInvoice = {
  id: string;
  doc_number: string | null;
  txn_date: string;
  due_date: string | null;
  currency: string;
  amount_cents: number;
  balance_cents: number;
  status: string;
  memo: string | null;
  customer_name: string | null;
};

export async function getInvoicesForCompany(companyId: string): Promise<AdminInvoice[]> {
  const { data } = await companyOs
    .from("invoices")
    .select("id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, memo, customer_name")
    .eq("company_id", companyId)
    .neq("status", "voided")
    .order("txn_date", { ascending: false });
  return (data ?? []) as AdminInvoice[];
}
