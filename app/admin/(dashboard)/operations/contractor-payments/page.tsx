import { listEntity } from "@/lib/admin/query";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/admin/Badge";
import { FilterBar } from "@/components/admin/FilterBar";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { getSensitiveViewer } from "@/lib/admin-auth";
import { PAYMENT_STATUSES, formatHours, paymentTone } from "@/lib/admin/contractors";
import { PAYMENT_SELECT, monthLabel, onePerson, type PaymentRow } from "./payment-shared";
import { PaymentsShelfProvider, PaymentShelfRow } from "./PaymentsShelf";
import { RollupButtons } from "./RollupButtons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contractor Payments",
  description: "Monthly contractor payment requests — review, pay, reconcile.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["period_month", "status", "amount_cents", "created_at"]);

export default async function ContractorPaymentsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  // The whole page is pay data (monthly payment amounts), so it is gated like
  // salaries (Dave & Mai): non-cleared admins get a notice and no query runs.
  const viewer = await getSensitiveViewer();
  if (!viewer?.canViewSensitive) {
    return (
      <>
        <PageHead
          eyebrow="Operations"
          title="Contractor Payments"
          sub="Monthly contractor payment requests"
        />
        <p className="admin-cell-muted">Restricted — visible to Dave and Mai only.</p>
      </>
    );
  }

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "period_month";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);

  const filters: Record<string, string> = {};
  if (statusParam && (PAYMENT_STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  }

  const { rows, total, pageSize, error } = await listEntity<PaymentRow>(
    "contractor_payments",
    PAYMENT_SELECT,
    { page, pageSize: pageSizeChoice, sort, dir, filters },
  );

  const columns: Column<PaymentRow>[] = [
    {
      key: "period_month",
      header: "Month",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{monthLabel(r.period_month)}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => onePerson(r.people)?.full_name || onePerson(r.people)?.email || "—",
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      cell: (r) => (
        <span className="admin-cell-mono">
          {formatHours(r.total_regular_hours)}
          {Number(r.total_overtime_hours) > 0 ? ` + ${formatHours(r.total_overtime_hours)} OT` : ""}
        </span>
      ),
    },
    {
      key: "amount_cents",
      header: "Amount",
      sortable: true,
      align: "right",
      cell: (r) => <span className="admin-cell-mono">{formatCents(r.amount_cents, r.currency)}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <Badge tone={paymentTone(r.status)}>{humanize(r.status)}</Badge>,
    },
    { key: "paid_at", header: "Paid", cell: (r) => (r.paid_at ? formatDate(r.paid_at) : <span className="admin-cell-muted">—</span>) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Contractor Payments"
        sub={`${total.toLocaleString()} ${total === 1 ? "payment request" : "payment requests"} · auto-created on the 1st from accepted work`}
        action={<RollupButtons />}
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <PaymentsShelfProvider>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/operations/contractor-payments"
          searchParams={searchParams}
          emptyText="No payment requests yet — they appear after accepted work is rolled up."
          filterBar={
            <FilterBar
              basePath="/admin/operations/contractor-payments"
              searchParams={searchParams}
              filters={[
                { key: "status", label: "Status", options: PAYMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
              ]}
            />
          }
          renderRow={(row, cells) => <PaymentShelfRow row={row}>{cells}</PaymentShelfRow>}
        />
      </PaymentsShelfProvider>
    </>
  );
}
