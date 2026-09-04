import { notFound } from "next/navigation";
import { requirePortalMember } from "@/lib/portal-auth";
import { adminCompanyScope } from "@/lib/portal/roles";
import { getCompanyProfile, type CompanyProfileView } from "@/lib/portal/profile";
import { PageHead } from "@/components/admin/PageHead";
import { CompanyForm } from "./CompanyForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Company Profile",
  description: "Your company's details as Edge8 holds them.",
};

// Admin-only, same rule as Users: non-admins never see the nav item and a
// direct visit 404s. One card per company the actor administers.
export default async function CompanyProfilePage() {
  const actor = await requirePortalMember();
  const companyIds = adminCompanyScope(actor);
  if (companyIds.length === 0) notFound();

  const profiles: CompanyProfileView[] = [];
  for (const id of companyIds) {
    const p = await getCompanyProfile(actor, id);
    if (p) profiles.push(p);
  }
  if (profiles.length === 0) notFound();

  return (
    <div className="u-max-narrow">
      <PageHead
        eyebrow="Account"
        title="Company Profile"
        sub="What Edge8 holds about your company. Changes here update your account record and the address we bill to."
      />
      {profiles.map((p) => (
        <CompanyForm key={p.companyId} initial={p} />
      ))}
    </div>
  );
}
