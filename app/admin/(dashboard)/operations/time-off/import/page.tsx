import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { ImportRunner } from "./ImportRunner";

export const dynamic = "force-dynamic";

export const metadata = { title: "Day Off import" };

// One-time Day Off migration console. The importer is idempotent (provenance
// keys); the final run happens at cutover per the runbook in
// docs/plans/2026-07-05-dayoff-migration-plan.md.
export default async function DayoffImportPage() {
  const [snapRes, linkedRes, reqRes, adjRes] = await Promise.all([
    companyOs.from("dayoff_snapshot").select("id", { count: "exact", head: true }),
    companyOs.from("team_members").select("id", { count: "exact", head: true }).not("dayoff_employee_id", "is", null),
    companyOs.from("time_off").select("id", { count: "exact", head: true }).eq("external_source", "dayoff"),
    companyOs.from("leave_adjustments").select("id", { count: "exact", head: true }).eq("source", "dayoff"),
  ]);

  return (
    <>
      <PageHead
        eyebrow="Operations · Time Off"
        title="Day Off import"
        sub="One-time migration from day-off.app. Idempotent — re-running updates in place."
      />

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Snapshots captured" value={snapRes.count ?? 0} />
        <MetricCard label="Members linked" value={linkedRes.count ?? 0} />
        <MetricCard label="Requests imported" value={reqRes.count ?? 0} />
        <MetricCard label="Balance adjustments" value={adjRes.count ?? 0} />
      </div>

      <ImportRunner />
    </>
  );
}
