import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { listEntity } from "@/lib/admin/query";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge, statusTone } from "@/components/admin/Badge";
import { FilterBar } from "@/components/admin/FilterBar";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { INVOICE_SELECT, ENTITY_LABEL, type InvoiceListRow, type InvoiceEntity } from "./invoice-shared";
import { InvoicesShelfProvider, InvoiceShelfRow } from "./InvoicesShelf";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invoices",
  description: "QuickBooks invoice ledger — read-only mirror, synced weekly.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["doc_number", "txn_date", "due_date", "amount_cents", "balance_cents"]);
const STATUSES = ["paid", "open", "overdue", "voided"] as const;
const ENTITIES = ["edge8", "aio"] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "txn_date";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);
  const entityParam = firstParam(searchParams.entity);

  // Voided invoices are hidden unless explicitly filtered to — they stay
  // reachable via the Voided option in the status filter.
  const filters: Record<string, string | string[]> = {};
  if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  } else {
    filters.status = STATUSES.filter((s) => s !== "voided");
  }
  if (entityParam && (ENTITIES as readonly string[]).includes(entityParam)) {
    filters.entity = entityParam;
  }

  const [{ rows, total, pageSize, error }, outstandingRes] = await Promise.all([
    listEntity<InvoiceListRow>("invoices", INVOICE_SELECT, {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["doc_number", "customer_name"],
      sort,
      dir,
      filters,
    }),
    companyOs.from("invoices").select("balance_cents").in("status", ["open", "overdue"]),
  ]);

  const outstandingCents = ((outstandingRes.data as { balance_cents: number }[] | null) ?? []).reduce(
    (s, r) => s + r.balance_cents,
    0,
  );

  const columns: Column<InvoiceListRow>[] = [
    {
      key: "doc_number",
      header: "Invoice",
      sortable: true,
      cell: (r) => <span className="admin-cell-mono admin-cell-strong">{r.doc_number || "—"}</span>,
    },
    {
      key: "company",
      header: "Company",
      cell: (r) =>
        r.companies ? (
          <Link href={`/admin/revenue/companies/${r.company_id}`}>{r.companies.name}</Link>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "customer_name",
      header: "Billed to",
      cell: (r) =>
        r.customer_name && r.customer_name !== r.companies?.name ? (
          <span className="admin-cell-muted">{r.customer_name}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "txn_date", header: "Date", sortable: true, cell: (r) => formatDate(r.txn_date) },
    {
      key: "due_date",
      header: "Due",
      sortable: true,
      cell: (r) => (r.due_date ? formatDate(r.due_date) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "amount_cents",
      header: "Amount",
      sortable: true,
      cell: (r) => <span className="admin-cell-mono">{formatCents(r.amount_cents, r.currency)}</span>,
    },
    {
      key: "balance_cents",
      header: "Balance",
      sortable: true,
      cell: (r) =>
        r.balance_cents > 0 ? (
          <span className="admin-cell-mono">{formatCents(r.balance_cents, r.currency)}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "entity",
      header: "Source",
      cell: (r) => <span className="admin-cell-muted">{ENTITY_LABEL[r.entity] ?? r.entity}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Invoices"
        sub={`${total.toLocaleString()} ${total === 1 ? "invoice" : "invoices"} · ${formatCents(outstandingCents)} outstanding · synced from QuickBooks`}
        action={<SyncButton />}
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <InvoicesShelfProvider>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/revenue/invoices"
          searchParams={searchParams}
          searchPlaceholder="Search invoice # or billed-to name…"
          emptyText="No invoices match."
          filterBar={
            <FilterBar
              basePath="/admin/revenue/invoices"
              searchParams={searchParams}
              filters={[
                { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
                { key: "entity", label: "Source", options: ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e as InvoiceEntity] })) },
              ]}
            />
          }
          renderRow={(row, cells) => <InvoiceShelfRow row={row}>{cells}</InvoiceShelfRow>}
        />
      </InvoicesShelfProvider>
    </>
  );
}
