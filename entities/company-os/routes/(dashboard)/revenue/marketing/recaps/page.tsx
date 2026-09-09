import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listMarketingRecaps, type MarketingRecapRow } from "@/entities/company-os/modules/campaigns/marketing-recaps";

export const metadata: Metadata = {
  title: "Content recommendations",
  description: "Monthly marketing recaps and what to produce next, from broadcast engagement.",
};

function monthLabel(periodMonth: string): string {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

function RecapCard({ recap }: { recap: MarketingRecapRow }) {
  const m = recap.metrics;
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-title">{monthLabel(recap.periodMonth)}</div>

      <div className="admin-kpi-grid u-mt-3">
        <MetricCard label="Broadcasts" value={m.broadcasts.toLocaleString()} />
        <MetricCard label="Sent" value={m.sent.toLocaleString()} sub={`${m.delivered.toLocaleString()} delivered`} />
        <MetricCard label="Open" value={pct(m.opened, m.delivered)} sub={`${m.opened.toLocaleString()} opens`} />
        <MetricCard label="Click" value={pct(m.clicked, m.delivered)} sub={`${m.clicked.toLocaleString()} clicks`} />
        <MetricCard label="Unsub" value={m.unsubscribed.toLocaleString()} />
      </div>

      <p className="u-mt-4">{recap.readout}</p>

      {recap.suggestions.length > 0 && (
        <>
          <div className="admin-card-title u-mt-4">Produce next</div>
          <ul className="u-mt-2">
            {recap.suggestions.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong> — {s.rationale}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default async function MarketingRecapsPage() {
  await requireAdmin();
  const { rows, error } = await listMarketingRecaps();

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Content recommendations"
        sub="Monthly recaps of email marketing and what to produce next, grounded in which topics earned opens and clicks. Written on the 4th of each month."
      />

      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}

      {rows.length === 0 ? (
        <div className="admin-empty">No recaps yet. The first one lands on the 4th of next month.</div>
      ) : (
        rows.map((recap) => <RecapCard key={recap.id} recap={recap} />)
      )}
    </div>
  );
}
