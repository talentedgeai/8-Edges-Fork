import { requireAdmin } from "@/lib/admin-auth";
import { PageHead } from "@/components/admin/PageHead";
import { Tabs } from "@/components/admin/Tabs";
import { getCompanyGoals } from "@/lib/company/goals";
import { getAdminRosterGoals } from "@/lib/coaching/data";
import { CompanyGoalsEditor } from "./CompanyGoalsEditor";
import { IndividualGoalsEditor } from "./IndividualGoalsEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Company Goals" };

// /admin/company/goals — the single place company goals are edited. Tab one is
// the company objectives + key results (inline add / edit / check-in); tab two
// is every member's individual FAST goals, which an admin can also edit here.
// Both drive the read-only /team/company-goals view the whole team sees.
export default async function AdminCompanyGoalsPage() {
  await requireAdmin();
  const [{ quarter, tree, initialsById, ladderedByKr }, roster] = await Promise.all([
    getCompanyGoals(),
    getAdminRosterGoals(),
  ]);

  const companyPanel = (
    <CompanyGoalsEditor
      tree={tree}
      initialsById={initialsById}
      ladderedByKr={ladderedByKr}
      quarter={quarter.label}
      emptyLabel={`No objectives for ${quarter.label} yet. Add the first one.`}
    />
  );

  const teamPanel = (
    <IndividualGoalsEditor members={roster.members} edges={roster.edges} quarter={quarter.label} />
  );

  return (
    <>
      <PageHead eyebrow="Company" title="Company Goals" sub={`${quarter.label} · week ${quarter.week} of ${quarter.totalWeeks}`} />
      <Tabs
        tabs={[
          { key: "company", label: "Company goals", content: companyPanel },
          { key: "team", label: "Individual goals", count: roster.members.length, content: teamPanel },
        ]}
      />
    </>
  );
}
