import { notFound } from "next/navigation";
import { requirePortalMember } from "@/lib/portal-auth";
import { getPersonalProfile } from "@/lib/portal/profile";
import { PageHead } from "@/components/admin/PageHead";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Personal Profile",
  description: "Your own contact details.",
};

// Self-scoped, open to every role: this is the actor's own person record.
export default async function PortalProfilePage() {
  const actor = await requirePortalMember();
  const profile = await getPersonalProfile(actor);
  if (!profile) notFound();

  return (
    <div className="u-max-narrow">
      <PageHead
        eyebrow="Account"
        title="Personal Profile"
        sub="Your own details. Your company's details live on the Company Profile page."
      />
      <ProfileForm initial={profile} canEditTitle={actor.companyScope.length === 1} />
    </div>
  );
}
