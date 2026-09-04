import { redirect } from "next/navigation";
import { requirePortalMember } from "@/lib/portal-auth";
import { getTokenUsage, PACK_PRICE_CENTS, PACK_TOKENS } from "@/lib/portal/tokens";
import { formatLeverage } from "@/lib/hub/tokens";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { formatCents, formatDate } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { TokenPurchaseCard } from "./TokenPurchaseCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Human Tokens",
  description: "Pre-buy packs of skilled hours and track delivery.",
};

const PURCHASE_TONE = { paid: "ok", pending: "warn", expired: "neutral" } as const;
const PURCHASE_LABEL = { paid: "Paid", pending: "Processing", expired: "Expired" } as const;

// Tokens are whole numbers; delivered hours can be fractional, show at most
// one decimal so 12.5 reads as 12.5 and 12.0 reads as 12.
function fmtTokens(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function fmtHours(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
export default async function PortalTokensPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const actor = await requirePortalMember();
  // Balances and delivery are company-scoped; a member with no company in
  // scope has nothing to see here (the nav entitlement hides the link, but the
  // route itself must gate too).
  if (actor.companyScope.length === 0) redirect("/portal");
  const usage = await getTokenUsage(actor);
  const justPaid = firstParam(searchParams.status) === "success";

  const boughtSub =
    usage.allocatedTokens > 0
      ? `${fmtTokens(usage.purchasedTokens)} purchased + ${fmtTokens(usage.allocatedTokens)} allocated`
      : "hours of skilled work purchased";

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title="Human Tokens"
        sub={`1 token = 1 hour of skilled work. A pack is ${PACK_TOKENS} tokens for ${formatCents(PACK_PRICE_CENTS, "usd")}.`}
      />

      {justPaid && (
        <div className="admin-alert admin-alert--ok u-mb-4">
          Payment received, thank you! Your balance updates within a few seconds once Stripe confirms.
        </div>
      )}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Bought" value={fmtTokens(usage.boughtTokens)} sub={boughtSub} />
        <MetricCard
          label="Delivered"
          value={fmtHours(usage.deliveredHours)}
          sub="tracked hours of skilled work"
        />
        <MetricCard
          label="Balance"
          value={fmtTokens(usage.balanceTokens)}
          sub="tokens remaining (bought minus delivered)"
        />
        <MetricCard
          label="Planned"
          value={fmtTokens(usage.plannedTokens)}
          sub="estimated tokens on your roadmap"
        />
        <MetricCard
          label="AI leverage"
          value={formatLeverage(usage.leverage)}
          sub="AI value delivered per human hour"
        />
        {usage.pendingTokens > 0 && (
          <MetricCard
            label="Processing"
            value={fmtTokens(usage.pendingTokens)}
            sub="awaiting payment confirmation"
          />
        )}
      </div>

      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">By AI Program</h2>
        {usage.programs.length === 0 ? (
          <div className="admin-empty">
            No tracked delivery yet. Once your AI Programs are underway, delivered hours and AI
            leverage appear here per program. Your token balance is a company-wide pool shared
            across programs.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>AI Program</th>
                  <th className="u-right">Delivered hours</th>
                  <th className="u-right">AI tokens</th>
                  <th className="u-right">AI leverage</th>
                </tr>
              </thead>
              <tbody>
                {usage.programs.map((p) => (
                  <tr key={p.repoId ?? "unassigned"}>
                    <td>{p.name}</td>
                    <td className="admin-cell-mono u-right">
                      {fmtHours(p.deliveredHours)}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {fmtTokens(p.aiTokens)}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {formatLeverage(p.leverage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="admin-cell-muted u-mt-2 u-mb-0">
              Tokens are a company-wide pool shared across programs; delivered hours and AI usage
              are tracked per program.
            </p>
          </div>
        )}
      </div>

      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">Buy token packs</h2>
        {actor.impersonation && (
          <p className="admin-page-sub u-mt-0">
            Viewing as client: checkout is disabled. This is what the client sees.
          </p>
        )}
        <TokenPurchaseCard />
      </div>

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Purchases</h2>
        {usage.purchases.length === 0 ? (
          <div className="admin-empty">No token purchases yet.</div>
        ) : (
          <div className="admin-list">
            {usage.purchases.map((p) => (
              <div className="admin-list-row" key={p.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {p.packs} {p.packs === 1 ? "pack" : "packs"} · {p.tokens} tokens
                  </div>
                  <div className="admin-list-sub">
                    {formatCents(p.amountCents, "usd")} · {formatDate(p.paidAt ?? p.createdAt)}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
