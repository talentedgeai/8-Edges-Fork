import { requireTeamMember } from "@/kernel/identity/team-auth";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { parseStrategy, StrategyView, type StrategyRow } from "@/entities/company-os";

export const metadata = {
  title: "Strategy",
  description: "The company strategy for the year, visible to the whole team.",
};

// /team/strategy — read-only, company-visible view of the latest strategies
// row. Content is edited from the admin Company section (title + body_md); the
// designed rendering lives in components/company/StrategyView so this page and
// the admin one stay identical.
export default async function TeamStrategyPage() {
  await requireTeamMember();

  const res = await companyOs
    .from("strategies")
    .select("id, year, title, body_md")
    .order("year", { ascending: false })
    .limit(1);
  const strategy = (res.data?.[0] as StrategyRow | undefined) ?? null;
  const parsed = strategy ? await parseStrategy(strategy) : null;

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Strategy"
        sub={strategy ? `The plan we're running for ${strategy.year}` : undefined}
      />

      {!parsed && <div className="admin-empty">No strategy published yet.</div>}
      {parsed && <StrategyView parsed={parsed} />}
    </>
  );
}
