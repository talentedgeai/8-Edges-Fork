import { listEntity } from "@/lib/admin/query";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/admin/Badge";
import { FilterBar } from "@/components/admin/FilterBar";
import { INDUSTRY_CATEGORIES, SIZE_BANDS } from "@/lib/admin/company-enums";
import { formatDate, humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { CompanyLinkRow, type CompanyRow } from "../companies/CompanyRow";
import { ClientCards } from "@/components/admin/ClientCards";
import { ClientsActiveToggle } from "./ClientsActiveToggle";
import { ClientRowActions } from "./ClientRowActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clients",
  description: "Companies we currently serve as clients.",
};

// Revenue office: a client-focused view of the Companies list. Defaults to
// active clients (lifecycle customer/evangelist); the inactive toggle drops the
// lifecycle filter to reveal every non-archived company.
type Company = CompanyRow;

const BASE_PATH = "/admin/revenue/clients";
// Raise-only lifecycle model: evangelist outranks customer, both are clients.
const CLIENT_STAGES = ["customer", "evangelist"];
const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "website_url", "industry_normalized", "size_band", "country", "priority", "created_at"]);

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default async function ClientsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const showInactive = firstParam(searchParams.inactive) === "1";
  const view = firstParam(searchParams.view) === "cards" ? "cards" : "list";
  const priorityParam = firstParam(searchParams.priority);
  const industryParam = firstParam(searchParams.industry);
  const bandParam = firstParam(searchParams.size_band);

  const filters: Record<string, string | number | boolean | null | (string | number)[]> = {};
  // Default: active clients only. Inactive view drops this to reveal non-clients.
  if (!showInactive) filters.lifecycle_stage = CLIENT_STAGES;
  if (priorityParam) filters.priority = priorityParam;
  if (industryParam && (INDUSTRY_CATEGORIES as readonly string[]).includes(industryParam)) {
    filters.industry_normalized = industryParam;
  }
  if (bandParam && (SIZE_BANDS as readonly string[]).includes(bandParam)) {
    filters.size_band = bandParam;
  }

  const { rows, total, pageSize, error } = await listEntity<Company>(
    "companies",
    "id, name, website_url, industry, industry_normalized, size_band, country, priority, archived_at, created_at",
    {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["name", "website_url"],
      sort,
      dir,
      excludeArchived: true,
      filters,
    },
  );

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{r.name || "(no name)"}</span>,
    },
    { key: "website_url", header: "Website URL", sortable: true, cell: (r) => <span className="admin-cell-muted">{r.website_url || "—"}</span> },
    {
      key: "industry_normalized",
      header: "Industry",
      sortable: true,
      cell: (r) => r.industry_normalized || r.industry || <span className="admin-cell-muted">—</span>,
    },
    { key: "size_band", header: "Size", sortable: true, cell: (r) => r.size_band || <span className="admin-cell-muted">—</span> },
    { key: "country", header: "Country", sortable: true, cell: (r) => r.country || <span className="admin-cell-muted">—</span> },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      cell: (r) => (r.priority ? <Badge>{humanize(r.priority)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => <ClientRowActions id={r.id} name={r.name} />,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Clients"
        sub={
          showInactive
            ? `${total.toLocaleString()} ${total === 1 ? "company" : "companies"} · including inactive`
            : `${total.toLocaleString()} active ${total === 1 ? "client" : "clients"}`
        }
        action={<ClientsActiveToggle basePath={BASE_PATH} searchParams={searchParams} showInactive={showInactive} />}
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        sort={sort}
        dir={dir}
        basePath={BASE_PATH}
        searchParams={searchParams}
        searchPlaceholder="Search name or website…"
        emptyText={showInactive ? "No companies match." : "No active clients match."}
        filterBar={
          <FilterBar
            basePath={BASE_PATH}
            searchParams={searchParams}
            filters={[
              { key: "industry", label: "Industry", options: INDUSTRY_CATEGORIES.map((c) => ({ value: c, label: c })) },
              { key: "size_band", label: "Size", options: SIZE_BANDS.map((b) => ({ value: b, label: b })) },
              { key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
            ]}
          />
        }
        view={view}
        renderCards={(cardRows) => (
          <ClientCards
            rows={cardRows}
            detailBasePath="/admin/revenue/companies"
            subText={(r) =>
              [r.industry_normalized || r.industry, r.priority ? humanize(r.priority) : null]
                .filter(Boolean)
                .join(" · ")
            }
          />
        )}
        renderRow={(row, cells) => <CompanyLinkRow row={row} hrefQuery="?from=clients">{cells}</CompanyLinkRow>}
      />
    </>
  );
}
