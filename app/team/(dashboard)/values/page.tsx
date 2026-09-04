import { requireTeamMember } from "@/lib/team-auth";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { CoreValuesGrid, type ValueRow } from "@/components/company/CoreValuesGrid";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Core Values",
  description: "The six values Edge8 works by.",
};

// /team/values — the six core values, company-visible and read-only. Rows live
// in company_os.core_values, edited from the admin Company section.
export default async function TeamValuesPage() {
  await requireTeamMember();

  const res = await companyOs
    .from("core_values")
    .select("id, sort_order, title, description")
    .order("sort_order");
  const values = (res.data ?? []) as ValueRow[];

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Core Values"
        sub="How we work, whatever we're working on."
      />

      {values.length === 0 && <div className="admin-empty">No core values published yet.</div>}

      <CoreValuesGrid values={values} />
    </>
  );
}
