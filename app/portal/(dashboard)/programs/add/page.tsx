import Link from "next/link";
import { requirePortalMember } from "@/lib/portal-auth";
import { PageHead } from "@/components/admin/PageHead";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add AI Program Plan",
  description: "Start a new AI program by uploading documents or building a plan.",
};

export default async function AddAiProgramPage() {
  await requirePortalMember();
  return (
    <div className="admin-content">
      <PageHead
        eyebrow={<Link href="/portal/programs">← AI Programs</Link>}
        title="Add AI Program Plan"
        sub="Two ways to start a program. Build a plan from scratch with our guided assistant, or upload documents you already have."
      />
      <div className="admin-kpi-grid admin-kpi-grid--2up" style={{ gridAutoRows: "1fr" }}>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Create a plan</h2>
          <p className="admin-page-sub" style={{ margin: 0, minHeight: 56 }}>
            A guided assistant walks you through mapping your team&apos;s AI opportunities, picking one,
            writing a problem statement and FAST goal, and assembling a 5Ds AI Program Brief you can save and download.
          </p>
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <Link href="/portal/programs/add/plan" className="admin-btn admin-btn--primary">
              Build a plan
            </Link>
          </div>
        </div>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Upload documents</h2>
          <p className="admin-page-sub" style={{ margin: 0, minHeight: 56 }}>
            Already have a brief, plan, or supporting material? Name the program and upload one or more files.
            Everything stays private to your company.
          </p>
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <Link href="/portal/programs/add/upload" className="admin-btn">
              Upload documents
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
