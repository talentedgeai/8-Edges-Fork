import Link from "next/link";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { UploadProgramForm } from "./UploadProgramForm";

export const metadata = {
  title: "Upload documents",
  description: "Start an AI program by uploading your documents.",
};

export default async function UploadProgramPage() {
  const actor = await requirePortalMember();
  const companies = actor.memberships
    .filter((m): m is typeof m & { companyId: string } => !!m.companyId)
    .map((m) => ({ companyId: m.companyId, companyName: m.companyName ?? "Your company" }));

  return (
    <div className="admin-content">
      <PageHead
        eyebrow={<Link href="/portal/programs/add">← Add a program</Link>}
        title="Upload documents"
        sub="Name your program and upload the documents you already have. Files stay private to your company."
      />
      <div className="admin-card admin-section-card u-mb-4">
        <UploadProgramForm companies={companies} />
      </div>
    </div>
  );
}
