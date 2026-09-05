import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { contributorCompanyScope } from "@/entities/portal/lib/roles";
import { listPortalProgramSummaries, getPortalHubOverview } from "@/entities/portal/lib/program-hub";
import { formatLeverage } from "@/entities/portal/lib/hub-tokens";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatHours, humanize } from "@/kernel/ui/format";

export const metadata: Metadata = { title: "AI Programs" };

function fmtTokens(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
// AI tokens run into the hundreds of millions; compact keeps the KPI legible.
function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// The AI Programs hub: a company-grain overview row (the shared Human Token
// pool, AI usage, merged pull requests, and normalized leverage), then the AI
// Program cards. One list for the whole portal (/portal/programs redirects
// here). Every figure is a client-safe scalar from the projection boundary in
// entities/portal/lib/program-hub.ts; repo names, PR numbers, and author logins never
// reach this module.
export default async function PortalHubPage() {
  const actor = await requirePortalMember();
  const [overview, programs] = await Promise.all([
    getPortalHubOverview(actor),
    listPortalProgramSummaries(actor),
  ]);
  // Creating programs is contributor+ (viewers browse only), same gate as the
  // former AI Programs list page.
  const canCreate = contributorCompanyScope(actor).length > 0;

  const boughtSub =
    overview.boughtTokens > 0 ? `${fmtTokens(overview.boughtTokens)} bought` : "none bought yet";

  return (
    <div className="admin-content">
      <PageHead
        eyebrow="Client Portal"
        title="AI Programs"
        sub="Your AI Programs with Edge8, and the company-wide delivery they add up to."
        action={
          canCreate ? (
            <Link href="/portal/programs/add" className="admin-btn admin-btn--primary">
              Add AI Program
            </Link>
          ) : undefined
        }
      />

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Human Tokens" value={fmtTokens(overview.balanceTokens)} sub={boughtSub} />
        <MetricCard label="AI Tokens" value={fmtCompact(overview.aiTokens)} sub="Claude + app tokens used" />
        <MetricCard
          label="Pull Requests"
          value={overview.prsMergedTotal.toLocaleString("en-US")}
          sub="merged to date"
        />
        <MetricCard
          label="Leverage"
          value={formatLeverage(overview.leverage)}
          sub="AI value delivered per human hour"
        />
      </div>

      {programs.length === 0 ? (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-2">No AI Programs yet</h2>
          <p className="admin-page-sub u-m-0">
            This is where you plan and track AI programs with Edge8. Start one from a guided plan or by
            uploading your own documents.
          </p>
          {canCreate && (
            <div className="u-mt-4">
              <Link href="/portal/programs/add" className="admin-btn admin-btn--primary">
                Add AI Program
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-3">Your programs</h2>
          <div className="admin-list">
            {programs.map((p) => {
              const meta = [
                p.roadmapTotal > 0 ? `Roadmap ${p.roadmapDone}/${p.roadmapTotal} done` : "No roadmap items yet",
                ...(p.hasRepo
                  ? [
                      `${formatHours(p.deliveredHours)} hrs delivered`,
                      `${p.prsMergedLast7d} ${p.prsMergedLast7d === 1 ? "update" : "updates"} this week`,
                    ]
                  : []),
              ].join(" · ");
              return (
                <Link
                  key={p.id}
                  href={`/portal/programs/${p.id}`}
                  className="admin-list-row u-link-plain"
                >
                  <div className="admin-list-main">
                    <div className="admin-list-title">{p.name}</div>
                    {p.description && <div className="admin-list-sub">{p.description}</div>}
                    <div className="admin-list-sub">{meta}</div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
