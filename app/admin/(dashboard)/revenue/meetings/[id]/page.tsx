import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getMeeting } from "@/lib/admin/meetings";
import { PageHead } from "@/components/admin/PageHead";
import { MeetingStatusBadges } from "@/components/admin/MeetingsTable";
import { MeetingControls } from "@/components/admin/MeetingControls";
import { renderPlanMarkdown } from "@/lib/admin/plan-markdown";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Meetings",
};

// Details page: everything for one meeting. The AI summary, the raw transcript
// (admin-only) and the mutations — publish to client, edit, retry, delete.
export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const meeting = await getMeeting(params.id);
  if (!meeting) notFound();

  const summaryHtml = meeting.aiSummary ? await renderPlanMarkdown(meeting.aiSummary) : null;

  return (
    <div className="admin-content">
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/admin/revenue/meetings">
          ← All client meetings
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Client Meetings"
        title={meeting.title || "Untitled meeting"}
        sub={meeting.meetingDate ? formatDate(meeting.meetingDate) : "Date not set"}
        action={<MeetingStatusBadges meeting={meeting} />}
      />

      <div className="admin-card admin-section-card">
        <div className="admin-cell-muted u-sm">
          <div>
            <strong>Client:</strong>{" "}
            {meeting.companyName ? (
              <Link href={`/admin/revenue/companies/${meeting.companyId}`}>{meeting.companyName}</Link>
            ) : (
              "—"
            )}
          </div>
          <div className="u-mt-1">
            <strong>Attendees:</strong> {meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "—"}
          </div>
        </div>

        <div className="u-mt-4">
          <div className="admin-shelf-heading u-mb-2">Summary</div>
          {meeting.aiStatus === "pending" ? (
            <div className="admin-cell-muted">Generating the summary…</div>
          ) : meeting.aiStatus === "failed" ? (
            <div className="admin-cell-muted">
              Summary failed{meeting.aiError ? `: ${meeting.aiError}` : "."} Use “Retry summary” below.
            </div>
          ) : summaryHtml ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
          ) : (
            <div className="admin-cell-muted">No summary.</div>
          )}
        </div>

        <details className="u-mt-4">
          <summary className="admin-cell-muted u-pointer">
            Full transcript{meeting.sourceFileName ? ` · ${meeting.sourceFileName}` : ""}
          </summary>
          <pre
            className="u-mt-2 u-prewrap u-break-all admin-scroll-md"
          >
            {meeting.transcript}
          </pre>
        </details>

        <MeetingControls
          id={meeting.id}
          published={!!meeting.publishedAt}
          aiStatus={meeting.aiStatus}
          redirectAfterDelete="/admin/revenue/meetings"
          initial={{
            title: meeting.title ?? "",
            meetingDate: meeting.meetingDate ?? "",
            attendees: meeting.attendees.join(", "),
            summary: meeting.aiSummary ?? "",
          }}
        />
      </div>
    </div>
  );
}
