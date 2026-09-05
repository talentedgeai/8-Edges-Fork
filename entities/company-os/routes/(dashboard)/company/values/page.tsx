import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { type ValueRow } from "@/entities/company-os/ui/company/CoreValuesGrid";
import { ValuesEditor } from "./ValuesEditor";

export const metadata = { title: "Core Values" };

// /admin/company/values — edit the core values the team reads at /team/values.
// company_os.core_values had no editor before this; the same rows drive the
// read-only team grid.
export default async function AdminValuesPage() {
  await requireAdmin();

  const res = await companyOs
    .from("core_values")
    .select("id, sort_order, title, description")
    .order("sort_order");
  const values = (res.data ?? []) as ValueRow[];

  return (
    <>
      <PageHead eyebrow="Company" title="Core Values" sub="How we work, whatever we're working on. Shown to the whole team." />
      <ValuesEditor values={values} />
    </>
  );
}
