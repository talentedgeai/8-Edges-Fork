import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { NewVendorForm } from "./NewVendorForm";

export const metadata = {
  title: "New vendor",
  description: "Add a supplier to the vendor directory.",
};

export default function NewVendorPage() {
  return (
    <>
      <PageHead
        eyebrow="Operations · Vendors"
        title="New vendor"
        sub="Add a supplier to the directory. Only the name is required."
        action={
          <Link href="/admin/operations/vendors" className="admin-btn admin-btn--sm">
            Back to vendors
          </Link>
        }
      />
      <div className="admin-card admin-section-card admin-content--form">
        <NewVendorForm />
      </div>
    </>
  );
}
