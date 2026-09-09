import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getOrgChart, getOpenRoles } from "@/entities/team";
import { PageHead } from "@/kernel/ui/PageHead";
import { OrgChart } from "@/entities/company-os/ui/company/OrgChart";

export const metadata = { title: "Org Chart" };

// /admin/company/org — the reporting tree, same shared component as /team/org.
// Read-only here: reporting lines are set by manager_id, edited under Talent
// (a person's manager on their team record), not on this company overview.
export default async function AdminOrgPage() {
  await requireAdmin();
  const [entries, openRoles] = await Promise.all([getOrgChart(), getOpenRoles()]);
  const openCount = openRoles.length;

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Org Chart"
        sub={`${entries.length} people${openCount ? ` · ${openCount} open ${openCount === 1 ? "role" : "roles"}` : ""} · reporting lines are edited under Talent`}
      />
      <OrgChart entries={entries} openRoles={openRoles} personHref={(id) => `/admin/talent/team/${id}`} />
    </>
  );
}
