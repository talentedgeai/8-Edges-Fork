import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalMember } from "@/lib/portal-auth";
import { getMeetingForActor } from "@/lib/portal/meetings";
import { renderPlanMarkdown } from "@/lib/admin/plan-markdown";
import { PageHead } from "@/components/admin/PageHead";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

// Client-facing meeting Details. A meeting outside the actor's companyScope, or
// one that is not published, does not resolve and 404s.
export default async function PortalMeetingDetailPage({ params }: { params: { id: string } }) {
  const actor = await requirePortalMember();
  const meeting = await getMeetingForActor(actor, params.id);
  if (!meeting) notFound();

  const summaryHtml = meeting.summary ? await renderPlanMarkdown(meeting.summary) : null;

  return (
    <>
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/portal/hub">
          ← Client Hub
        </Link>
      </div>

      <PageHead
        eyebrow="Client Portal · Meetings"
        title={meeting.title || "Meeting"}
        sub={meeting.meetingDate ? formatDate(meeting.meetingDate) : "Date not set"}
      />

      <div className="admin-card admin-section-card">
        <div className="admin-cell-muted u-sm">
          <strong>Attendees:</strong> {meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "—"}
        </div>
        {summaryHtml ? (
          <div className="admin-idea-plan u-mt-3" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        ) : (
          <div className="admin-cell-muted u-mt-3">No summary yet.</div>
        )}
      </div>
    </>
  );
}
