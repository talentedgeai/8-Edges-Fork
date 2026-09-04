import { requireSuperAdmin } from "@/lib/admin-auth";

// ATS is super-admin-only (Dave and Mai). This layout gates every page in the
// subtree — index, [id], new — so a plain admin can never load recruiting data
// by navigating directly. The server actions carry their own requireSuperAdmin
// gate too; that, not this layout, is the real security boundary.
export default async function AtsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return <>{children}</>;
}
