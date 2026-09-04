import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listCompanyOptions } from "@/lib/admin/meetings";
import { PageHead } from "@/components/admin/PageHead";
import { MeetingUploadForm } from "@/components/admin/MeetingUploadForm";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add Client Meeting",
  description: "Upload a meeting transcript and let AI summarize it.",
};

// Add New page. Reached from the List page and from the company 360 tab, which
// passes ?company=<id> to preselect the client.
export default async function NewMeetingPage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireAdmin();
  const companies = await listCompanyOptions();
  const preselect = firstParam(searchParams.company);
  const defaultCompanyId = companies.some((c) => c.id === preselect) ? preselect : undefined;

  return (
    <div className="admin-content--form">
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/admin/revenue/meetings">
          ← All meeting notes
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Client Meetings"
        title="Add client meeting"
        sub="Paste a transcript or upload a file. AI writes the summary, then you publish it to the client."
      />

      <div className="admin-card admin-section-card">
        <MeetingUploadForm companies={companies} defaultCompanyId={defaultCompanyId} />
      </div>
    </div>
  );
}
