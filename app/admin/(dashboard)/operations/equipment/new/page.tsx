import Link from "next/link";
import { PageHead } from "@/components/admin/PageHead";
import { listVendorOptions } from "@/lib/admin/equipment";
import { NewEquipmentForm } from "./NewEquipmentForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New equipment",
  description: "Add an item to the equipment register.",
};

export default async function NewEquipmentPage() {
  const vendors = await listVendorOptions();

  return (
    <>
      <PageHead
        eyebrow="Operations · Equipment"
        title="New equipment"
        sub="Add an item to the register. Only the name is required. It lands in stock, then Assign hands it to someone."
        action={
          <Link href="/admin/operations/equipment" className="admin-btn admin-btn--sm">
            Back to equipment
          </Link>
        }
      />
      <div className="admin-card admin-section-card admin-content">
        <NewEquipmentForm vendors={vendors} />
      </div>
    </>
  );
}
