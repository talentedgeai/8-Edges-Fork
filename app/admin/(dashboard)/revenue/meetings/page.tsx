import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listMeetings, listClientCompanies, type AdminMeetingRow } from "@/lib/admin/meetings";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { MeetingStatusBadges } from "@/components/admin/MeetingsTable";
import { formatDate } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Meetings",
  description: "Every client meeting on record, across all clients.",
};

const PAGE_SIZES = [25, 50, 100];

// List page. One row per meeting across every client; the summary and the raw
// transcript live on the Details page, uploading lives on the Add New page.
export default async function MeetingsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireAdmin();

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const statusParam = firstParam(searchParams.status);
  const status = statusParam === "published" || statusParam === "draft" ? statusParam : undefined;
  const company = firstParam(searchParams.company) || undefined;

  const [{ rows, total, error }, companies] = await Promise.all([
    listMeetings({ page, pageSize, search: q, status, company }),
    listClientCompanies(),
  ]);

  const columns: Column<AdminMeetingRow>[] = [
    {
      key: "meeting_date",
      header: "Date",
      cell: (m) => (m.meetingDate ? formatDate(m.meetingDate) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "title",
      header: "Meeting",
      cell: (m) => (
        <Link className="admin-cell-strong" href={`/admin/revenue/meetings/${m.id}`}>
          {m.title || "Untitled meeting"}
        </Link>
      ),
    },
    {
      key: "company",
      header: "Client",
      cell: (m) =>
        m.companyName ? (
          <Link href={`/admin/revenue/companies/${m.companyId}`}>{m.companyName}</Link>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "attendees",
      header: "Attendees",
      cell: (m) =>
        m.attendees.length > 0 ? (
          <span className="admin-cell-muted">{m.attendees.join(", ")}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "status", header: "Status", cell: (m) => <MeetingStatusBadges meeting={m} /> },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Client Meetings"
        sub={`${total.toLocaleString()} client meeting${total === 1 ? "" : "s"} on record`}
        action={
          <Link className="admin-btn admin-btn--primary" href="/admin/revenue/meetings/new">
            Add meeting
          </Link>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        basePath="/admin/revenue/meetings"
        searchParams={searchParams}
        searchPlaceholder="Search by meeting title or client…"
        emptyText="No meetings match."
        filterBar={
          <FilterBar
            basePath="/admin/revenue/meetings"
            searchParams={searchParams}
            filters={[
              {
                key: "company",
                label: "Client",
                options: companies.map((c) => ({ value: c.id, label: c.name })),
              },
              {
                key: "status",
                label: "Status",
                options: [
                  { value: "published", label: "Published" },
                  { value: "draft", label: "Draft" },
                ],
              },
            ]}
          />
        }
      />
    </>
  );
}
