import { companyOs } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { PageHead } from "@/components/admin/PageHead";
import { parseStrategy } from "@/lib/company/strategy";
import { StrategyView } from "@/components/company/StrategyView";
import { StrategyEditor } from "./StrategyEditor";
import type { StrategyRow } from "@/lib/company/edges-shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Strategy" };

// /admin/company/strategy — the company-visible strategy the team sees at
// /team/strategy, editable here. The designed rendering is the shared
// StrategyView; StrategyEditor overlays the raw title + body_md editor.
export default async function AdminStrategyPage() {
  await requireAdmin();

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
        sub={strategy ? `The plan we're running for ${strategy.year} · shown to the whole team` : "No strategy yet"}
      />

      {!strategy && <div className="admin-empty">No strategy row exists yet. Seed one, then edit it here.</div>}

      {strategy && parsed && (
        <StrategyEditor id={strategy.id} initialTitle={strategy.title} initialBody={strategy.body_md ?? ""}>
          <StrategyView parsed={parsed} />
        </StrategyEditor>
      )}
    </>
  );
}
