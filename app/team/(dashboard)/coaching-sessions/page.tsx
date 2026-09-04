import Link from "next/link";
import { requireTeamMember } from "@/lib/team-auth";
import { listCoachingSessions, type CoachingSessionRow } from "@/lib/team/coaching-sessions";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { formatDate } from "@/lib/admin/format";
import { type SearchParamsObj } from "@/lib/admin/url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AIO Group Coaching",
  description: "Program coaching recordings, transcripts, and our own actionable summaries.",
};

// Company-internal group coaching (e.g. AIOlabz). Not client-specific, so it
// lives here rather than under a client hub. Every team member can read it.
function minutes(seconds: number | null): string {
  return seconds ? `${Math.round(seconds / 60)} min` : "—";
}

export default async function CoachingSessionsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireTeamMember();
  const rows = await listCoachingSessions();

  const columns: Column<CoachingSessionRow>[] = [
    {
      key: "started_at",
      header: "Date",
      cell: (s) => (s.startedAt ? formatDate(s.startedAt) : <span className="admin-cell-muted">{"—"}</span>),
    },
    {
      key: "title",
      header: "Session",
      cell: (s) => (
        <Link className="admin-cell-strong" href={`/team/coaching-sessions/${s.id}`}>
          {s.title || "Coaching session"}
        </Link>
      ),
    },
    {
      key: "length",
      header: "Length",
      cell: (s) => <span className="admin-cell-muted">{minutes(s.durationSeconds)}</span>,
    },
    {
      key: "participants",
      header: "Participants",
      cell: (s) => (
        <span className="admin-cell-muted">{s.speakers.length > 0 ? s.speakers.join(", ") : "—"}</span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      cell: (s) => <span className="admin-cell-muted">{s.hasSummary ? "Ready" : "Pending"}</span>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Coaching"
        title="AIO Group Coaching"
        sub={`${rows.length} program coaching session${rows.length === 1 ? "" : "s"}. Not client-specific.`}
      />
      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        basePath="/team/coaching-sessions"
        searchParams={searchParams}
        emptyText="No coaching sessions ingested yet."
      />
    </>
  );
}
