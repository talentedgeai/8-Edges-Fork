import Link from "next/link";
import { listEntity } from "@/lib/admin/query";
import { byFirstName } from "@/lib/people-name";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/admin/Badge";
import { ArchivedToggle } from "@/components/admin/ArchivedToggle";
import { FilterBar } from "@/components/admin/FilterBar";
import { formatDate, humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import {
  equipmentSummary,
  listAssignablePeople,
  listPendingRequests,
  listVendorOptions,
} from "@/lib/admin/equipment";
import {
  EQUIPMENT_SELECT,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  specSummary,
  statusLabel,
  statusTone,
  type EquipmentRow,
} from "@/lib/admin/equipment-shared";
import { EquipmentShelfProvider, EquipmentShelfRow } from "./EquipmentShelf";
import { RequestsPanel } from "./RequestsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Equipment",
  description: "Company equipment register: what we own, who has it, and what it cost.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["asset_tag", "name", "type", "status", "purchase_date", "cost_vnd", "holder"]);

// "Assigned to" is a joined column, so it sorts through PostgREST's embedded
// ordering on the aliased embed rather than a column on equipment itself. The
// UI keeps the plain key ("holder") for the header state; only the query is
// remapped. Verified against the REST endpoint, not assumed.
const SORT_COLUMN: Record<string, string> = { holder: "holder(full_name)" };

export default async function EquipmentPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const showArchived = firstParam(searchParams.archived) === "1";
  const typeParam = firstParam(searchParams.type);
  const statusParam = firstParam(searchParams.status);

  const filters: Record<string, string> = {};
  if (typeParam && (EQUIPMENT_TYPES as readonly string[]).includes(typeParam)) filters.type = typeParam;
  if (statusParam && (EQUIPMENT_STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  }

  const [{ rows, total, pageSize, error }, summary, people, vendors, requests] = await Promise.all([
    listEntity<EquipmentRow>("equipment", EQUIPMENT_SELECT, {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["name", "asset_tag", "brand", "model", "serial_number", "notes"],
      sort: SORT_COLUMN[sort] ?? sort,
      dir,
      excludeArchived: !showArchived,
      filters,
    }),
    equipmentSummary(),
    listAssignablePeople(),
    listVendorOptions(),
    listPendingRequests(),
  ]);

  // Leavers can still hold equipment, and they aren't in the assignable list.
  // Merge any current holder on this page in so the shelf can name them.
  const holders = new Map(people.map((p) => [p.id, p]));
  for (const r of rows) {
    if (r.holder?.id && r.holder.full_name && !holders.has(r.holder.id)) {
      holders.set(r.holder.id, { id: r.holder.id, name: r.holder.full_name });
    }
  }
  const peopleOptions = [...holders.values()].sort((a, b) => byFirstName(a.name, b.name));

  const columns: Column<EquipmentRow>[] = [
    {
      key: "name",
      header: "Item",
      sortable: true,
      cell: (r) => (
        <div>
          <span className="admin-cell-strong">{r.name}</span>
          {specSummary(r) && <div className="admin-cell-muted">{specSummary(r)}</div>}
        </div>
      ),
    },
    { key: "asset_tag", header: "Tag", sortable: true, cell: (r) => <span className="admin-cell-mono">{r.asset_tag}</span> },
    { key: "type", header: "Type", sortable: true, cell: (r) => <Badge>{humanize(r.type)}</Badge> },
    {
      key: "holder",
      header: "Assigned to",
      sortable: true,
      cell: (r) => r.holder?.full_name ?? <span className="admin-cell-muted">Unassigned</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => (
        <span className="u-row">
          {r.archived_at && <Badge tone="neutral">Archived</Badge>}
          <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
        </span>
      ),
    },
    {
      key: "purchase_date",
      header: "Purchased",
      sortable: true,
      cell: (r) => (r.purchase_date ? formatDate(r.purchase_date) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "cost_vnd",
      header: "Cost",
      sortable: true,
      cell: (r) =>
        r.cost_vnd !== null && r.cost_vnd !== undefined ? (
          <span className="admin-cell-mono">{Number(r.cost_vnd).toLocaleString("en-US")}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
  ];

  const sub =
    `${total.toLocaleString()} ${total === 1 ? "item" : "items"}` +
    ` · ${summary.inUse} in use · ${summary.inStock} in stock` +
    ` · ${summary.valueVnd.toLocaleString("en-US")} VND on the register` +
    (showArchived ? " · showing archived" : "");

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Equipment"
        sub={sub}
        action={
          <div className="u-row">
            <ArchivedToggle basePath="/admin/operations/equipment" searchParams={searchParams} showArchived={showArchived} />
            <Link href="/admin/operations/equipment/fitness" className="admin-btn">
              Fitness
            </Link>
            <Link href="/admin/operations/equipment/new" className="admin-btn admin-btn--primary">
              New equipment
            </Link>
          </div>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <RequestsPanel requests={requests} />
      <EquipmentShelfProvider people={peopleOptions} vendors={vendors}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/operations/equipment"
          searchParams={searchParams}
          searchPlaceholder="Search name, tag, serial or notes…"
          emptyText="No equipment matches."
          filterBar={
            <FilterBar
              basePath="/admin/operations/equipment"
              searchParams={searchParams}
              filters={[
                { key: "type", label: "Type", options: EQUIPMENT_TYPES.map((t) => ({ value: t, label: humanize(t) })) },
                {
                  key: "status",
                  label: "Status",
                  options: EQUIPMENT_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
                },
              ]}
            />
          }
          renderRow={(row, cells) => <EquipmentShelfRow row={row}>{cells}</EquipmentShelfRow>}
        />
      </EquipmentShelfProvider>
    </>
  );
}
