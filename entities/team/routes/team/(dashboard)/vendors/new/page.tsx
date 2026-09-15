import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { NewTeamVendorForm } from "./NewTeamVendorForm";

export const metadata = {
  title: "New vendor",
  description: "Add a supplier to the vendor directory.",
};

export default async function TeamNewVendorPage() {
  await requireTeamMember();

  return (
    <>
      <PageHead
        eyebrow="Company · Vendors"
        title="New vendor"
        sub="Add a supplier to the directory. Only the name is required."
        action={
          <Link href="/team/vendors" className="admin-btn admin-btn--sm">
            Back to vendors
          </Link>
        }
      />
      <div className="admin-card admin-section-card admin-content--form">
        <NewTeamVendorForm />
      </div>
    </>
  );
}
