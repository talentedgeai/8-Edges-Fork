import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { listEntity, countEntity } from "@/entities/company-os/lib/query";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { FilterBar } from "@/entities/company-os/ui/FilterBar";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { one } from "@/kernel/config/embedded";

export const metadata = {
  title: "AIO Pad",
  description: "Scheduled bookings and reservations.",
};

// Revenue office: bookings (private sessions, stays). Each links to its person 360.
type P = { full_name: string | null; email: string };
type Pr = { title: string | null };
type Booking = {
  id: string;
  kind: string | null;
  start_date: string | null;
  end_date: string | null;
  party_size: number | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
  person_id: string | null;
  people: P | P[] | null;
  products: Pr | Pr[] | null;
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(["start_date", "kind", "party_size", "amount_usd_cents", "status", "created_at"]);

// Real distinct values in the table today (checked against the DB). Kind is omitted
// deliberately: every booking is currently a "stay", so it makes a single-value filter.
const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
];

export default async function AioPadPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);

  const filters: Record<string, string | number | boolean | null> = {};
  if (statusParam) filters.status = statusParam;

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ rows, total, pageSize, error }, upcomingRes, confirmedCount, totalRes, revRes] = await Promise.all([
    listEntity<Booking>(
      "bookings",
      "id, kind, start_date, end_date, party_size, amount_cents, amount_usd_cents, currency, status, created_at, person_id, people(full_name, email), products(title)",
      { page, pageSize: PAGE_SIZE, search: q, searchColumns: ["kind"], sort, dir, filters },
    ),
    companyOs.from("bookings").select("*", { count: "exact", head: true }).gte("start_date", today),
    countEntity("bookings", { status: "confirmed" }),
    companyOs.from("bookings").select("amount_usd_cents").eq("status", "confirmed"),
    companyOs
      .from("bookings")
      .select("amount_usd_cents")
      .eq("status", "confirmed")
      .gte("created_at", monthStart),
  ]);

  const upcomingCount = upcomingRes.count ?? 0;
  const sumCents = (res: { data: { amount_usd_cents: number | null }[] | null }) =>
    (res.data ?? []).reduce((s, r) => s + (r.amount_usd_cents ?? 0), 0);
  const totalCollected = sumCents(totalRes);
  const revenueThisMonth = sumCents(revRes);

  const columns: Column<Booking>[] = [
    {
      key: "person",
      header: "Contact",
      cell: (r) => {
        const p = one(r.people);
        const label = p?.full_name || p?.email;
        return <span className={label ? "admin-cell-strong" : "admin-cell-muted"}>{label || "—"}</span>;
      },
    },
    { key: "product", header: "Product", cell: (r) => one(r.products)?.title || <span className="admin-cell-muted">—</span> },
    { key: "kind", header: "Kind", sortable: true, cell: (r) => (r.kind ? <Badge>{humanize(r.kind)}</Badge> : <span className="admin-cell-muted">—</span>) },
    {
      key: "start_date",
      header: "Dates",
      sortable: true,
      cell: (r) =>
        r.start_date ? (
          r.end_date ? `${formatDate(r.start_date)} → ${formatDate(r.end_date)}` : formatDate(r.start_date)
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "party_size", header: "Party", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => r.party_size ?? <span className="admin-cell-muted">—</span> },
    { key: "amount_usd_cents", header: "Amount", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => formatCents(r.amount_usd_cents, "usd") },
    { key: "status", header: "Status", sortable: true, cell: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : <span className="admin-cell-muted">—</span>) },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead eyebrow="Revenue" title="AIO Pad" sub={`${total.toLocaleString()} ${total === 1 ? "booking" : "bookings"}`} />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Total Collected" value={formatCents(totalCollected)} sub="USD · confirmed bookings" />
        <MetricCard label="Revenue this Month" value={formatCents(revenueThisMonth)} sub="USD · confirmed bookings" />
        <MetricCard label="Upcoming" value={upcomingCount} sub="start date today or later" />
        <MetricCard label="Confirmed" value={confirmedCount} sub={`of ${total.toLocaleString()} bookings`} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        basePath="/admin/revenue/aio-pad"
        searchParams={searchParams}
        searchPlaceholder="Search kind…"
        emptyText="No bookings match."
        filterBar={
          <FilterBar
            basePath="/admin/revenue/aio-pad"
            searchParams={searchParams}
            filters={[{ key: "status", label: "Status", options: STATUS_OPTIONS }]}
          />
        }
        getRowPreview={(r) => {
          const p = one(r.people);
          return {
            eyebrow: "Booking",
            title: p?.full_name || p?.email || one(r.products)?.title || "Booking",
            body: (
              <>
                <dl className="admin-kv">
                  <dt>Contact</dt>
                  <dd>{p?.full_name || p?.email || "—"}</dd>
                  <dt>Product</dt>
                  <dd>{one(r.products)?.title || "—"}</dd>
                  <dt>Kind</dt>
                  <dd>{r.kind ? <Badge>{humanize(r.kind)}</Badge> : "—"}</dd>
                  <dt>Dates</dt>
                  <dd>
                    {r.start_date
                      ? r.end_date
                        ? `${formatDate(r.start_date)} → ${formatDate(r.end_date)}`
                        : formatDate(r.start_date)
                      : "—"}
                  </dd>
                  <dt>Party</dt>
                  <dd className="admin-cell-mono">{r.party_size ?? "—"}</dd>
                  <dt>Amount</dt>
                  <dd className="admin-cell-mono">{formatCents(r.amount_usd_cents, "usd")}</dd>
                  {(r.currency ?? "usd").toLowerCase() !== "usd" && (
                    <>
                      <dt>Native</dt>
                      <dd className="admin-cell-mono">{formatCents(r.amount_cents, r.currency ?? undefined)}</dd>
                    </>
                  )}
                  <dt>Status</dt>
                  <dd>{r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : "—"}</dd>
                  <dt>Created</dt>
                  <dd>{formatDate(r.created_at)}</dd>
                </dl>
                {r.person_id && (
                  <div className="u-mt-4">
                    <Link href={`/admin/contacts/${r.person_id}`} className="admin-btn admin-btn--primary">
                      Open contact
                    </Link>
                  </div>
                )}
              </>
            ),
          };
        }}
      />
    </>
  );
}
