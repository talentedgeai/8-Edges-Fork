import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getActorClientCompanies } from "@/entities/team/modules/hub/clients";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listEntity, FilterBar, ClientCards, CompanyLinkRow, type CompanyRow, INDUSTRY_CATEGORIES, SIZE_BANDS } from "@/entities/company-os";

export const metadata = {
  title: "My Clients",
};

// Team view of the shared Clients list: the same DataTable (list + card views)
// as /admin/revenue/clients, scoped to the companies THIS actor is actively
// assigned to. Rows/cards stay inside the team portal (/team/clients/[id] hub).
type TeamClientRow = CompanyRow & { roleTitle: string | null };

const BASE_PATH = "/team/clients";
const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "industry_normalized", "size_band", "country", "priority", "created_at"]);

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default async function TeamClientsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const actor = await requireTeamMember();
  const assigned = await getActorClientCompanies(actor);
  const roleById = new Map(assigned.map((a) => [a.id, a.roleTitle]));
  const assignedIds = assigned.map((a) => a.id);

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  // List is the default view (matching admin). The DataTable's "List" link
  // clears ?view=, so the default and the toggle must agree.
  const view = firstParam(searchParams.view) === "cards" ? "cards" : "list";
  const priorityParam = firstParam(searchParams.priority);
  const industryParam = firstParam(searchParams.industry);
  const bandParam = firstParam(searchParams.size_band);

  // Scope: the actor's assigned companies only. Resolved server-side from the
  // actor, never a passed id.
  const filters: Record<string, string | number | boolean | null | (string | number)[]> = {
    id: assignedIds,
  };
  if (priorityParam) filters.priority = priorityParam;
  if (industryParam && (INDUSTRY_CATEGORIES as readonly string[]).includes(industryParam)) {
    filters.industry_normalized = industryParam;
  }
  if (bandParam && (SIZE_BANDS as readonly string[]).includes(bandParam)) {
    filters.size_band = bandParam;
  }

  const empty = assignedIds.length === 0;
  const { rows, total, pageSize } = empty
    ? { rows: [] as CompanyRow[], total: 0, pageSize: pageSizeChoice }
    : await listEntity<CompanyRow>(
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

  const clientRows: TeamClientRow[] = rows.map((r) => ({ ...r, roleTitle: roleById.get(r.id) ?? null }));

  const columns: Column<TeamClientRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{r.name || "(no name)"}</span>,
    },
    { key: "roleTitle", header: "Your role", cell: (r) => r.roleTitle || <span className="admin-cell-muted">—</span> },
    {
      key: "industry_normalized",
      header: "Industry",
      sortable: true,
      cell: (r) => r.industry_normalized || r.industry || <span className="admin-cell-muted">—</span>,
    },
    { key: "size_band", header: "Size", sortable: true, cell: (r) => r.size_band || <span className="admin-cell-muted">—</span> },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      cell: (r) => (r.priority ? <Badge>{humanize(r.priority)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Team"
        title="My Clients"
        sub={`The clients you're assigned to. Open one to see their roadmap.`}
      />

      {empty ? (
        <div className="admin-card admin-section-card">
          <p className="admin-page-sub u-m-0">
            You&apos;re not assigned to any clients yet. When you&apos;re assigned to a client
            account, it shows up here with their roadmap.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={clientRows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath={BASE_PATH}
          searchParams={searchParams}
          searchPlaceholder="Search name or website…"
          emptyText="No clients match."
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
              detailBasePath={BASE_PATH}
              subText={(r) => r.roleTitle || "View roadmap"}
            />
          )}
          renderRow={(row, cells) => (
            <CompanyLinkRow row={row} detailBasePath={BASE_PATH}>
              {cells}
            </CompanyLinkRow>
          )}
        />
      )}
    </>
  );
}
