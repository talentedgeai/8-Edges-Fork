"use server";

import { revalidatePath } from "next/cache";
import { updateCompanies } from "@/kernel/identity/writes";
import { selectInvoices, updateInvoices } from "@/entities/finance";
import { companyOs } from "@/kernel/data/supabase";

import type { Json } from "@/kernel/data/supabase/database.types";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import type { QboEntity } from "@/entities/company-os/lib/qbo";
import { getQboInvoiceCustomerId } from "@/entities/company-os/lib/qbo-invoice-customer";
import { stripPostgrestMetacharacters } from "@/kernel/data/postgrest-filter";

// Links (or re-links, or clears) the CRM company behind a synced QuickBooks
// invoice, from the invoice shelf. QuickBooks stays the source of truth for the
// invoice; this only writes the customer -> company link the sync reads back.
// The link lives on company metadata (the same list the sync matches), and
// company_id is set on every invoice for that customer so the whole history
// moves together and the next sync keeps it.

export type CompanyHit = { id: string; name: string | null };

// The mapping list is realm-scoped: each entity has its own key on company
// metadata, because a customer id is only unique within one QuickBooks company.
const MAPPING_KEY: Record<QboEntity, string> = {
  edge8: "qbo_customer_ids",
  aio: "qbo_customer_ids_aio",
};

// Typeahead for the company picker. Same sanitizing and shape as the deals
// referring-company search.
export async function searchCompanies(query: string): Promise<CompanyHit[]> {
  await requireAdmin();

  const term = stripPostgrestMetacharacters(query.trim());
  if (term.length < 2) return [];

  const { data, error } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .ilike("name", `%${term}%`)
    .order("name")
    .limit(8);
  if (error) {
    console.error("[revenue/invoices] searchCompanies failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

function listOf(metadata: Record<string, unknown>, key: string): string[] {
  return Array.isArray(metadata[key]) ? (metadata[key] as unknown[]).map(String) : [];
}

export type MapResult =
  | { ok: true; company: CompanyHit | null; linkedCount: number }
  | { ok: false; error: string };

// companyId null clears the link. Any invoice with no stored customer id (a row
// synced before that column existed) has it resolved live from QuickBooks, so
// mapping works without a re-sync first.
export async function setInvoiceCustomerCompany(invoiceId: string, companyId: string | null): Promise<MapResult> {
  await requireAdmin();

  // finance owns invoices, so the read comes through its door and the row shape
  // is stated here rather than inferred from the column list.
  const { data: invoiceRow, error: invErr } = await selectInvoices("entity, customer_id, external_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return { ok: false, error: invErr.message };
  const invoice = invoiceRow as { entity: string; customer_id: string | null; external_id: string } | null;
  if (!invoice) return { ok: false, error: "Invoice not found." };

  const entity = invoice.entity as QboEntity;
  const key = MAPPING_KEY[entity];
  if (!key) return { ok: false, error: `Unknown QuickBooks entity "${entity}".` };

  // Resolve the customer id: stored if the sync has written it, otherwise a
  // live lookup, which we persist so the row is consistent from here on.
  let customerId = invoice.customer_id;
  if (!customerId) {
    const live = await getQboInvoiceCustomerId(entity, invoice.external_id);
    if (!live.ok) return { ok: false, error: `Couldn't reach QuickBooks to identify the customer (${live.error}).` };
    customerId = live.customerId;
    if (!customerId) return { ok: false, error: "QuickBooks has no customer on this invoice." };
    await updateInvoices({ customer_id: customerId }).eq("id", invoiceId);
  }

  // One customer maps to one company: strip this id from every company that
  // currently holds it for this entity before adding it to the chosen one, so a
  // re-link never leaves the id in two places.
  const { data: holders, error: holdersErr } = await companyOs
    .from("companies")
    .select("id, metadata")
    .filter(`metadata->${key}`, "cs", JSON.stringify([customerId]));
  if (holdersErr) return { ok: false, error: holdersErr.message };
  for (const h of (holders ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
    if (h.id === companyId) continue;
    const md = h.metadata ?? {};
    const next = listOf(md, key).filter((id) => id !== customerId);
    const { error } = await updateCompanies({ metadata: { ...md, [key]: next } as Json }).eq("id", h.id);
    if (error) return { ok: false, error: error.message };
  }

  let company: CompanyHit | null = null;
  if (companyId) {
    const { data: target, error: coErr } = await companyOs
      .from("companies")
      .select("id, name, metadata")
      .eq("id", companyId)
      .maybeSingle();
    if (coErr) return { ok: false, error: coErr.message };
    if (!target) return { ok: false, error: "Company not found." };
    const md = (target.metadata as Record<string, unknown> | null) ?? {};
    const ids = listOf(md, key);
    if (!ids.includes(customerId)) {
      const { error } = await updateCompanies({ metadata: { ...md, [key]: [...ids, customerId] } as Json })
        .eq("id", companyId);
      if (error) return { ok: false, error: error.message };
    }
    company = { id: target.id, name: target.name };
  }

  // Point (or unpoint) every invoice for this customer at the chosen company.
  const { data: touched, error: backfillErr } = await updateInvoices({ company_id: companyId })
    .eq("source", "quickbooks")
    .eq("entity", entity)
    .eq("customer_id", customerId)
    .select("id");
  if (backfillErr) return { ok: false, error: backfillErr.message };

  revalidatePath("/admin/revenue/invoices");
  return { ok: true, company, linkedCount: (touched ?? []).length };
}
