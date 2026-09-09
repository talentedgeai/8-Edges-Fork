"use client";

import { MetricCard } from "@/kernel/ui/MetricCard";
import { type CampaignReport } from "@/entities/company-os/modules/campaigns/marketing-campaigns";

// The delivery/engagement summary for a campaign.
export function ReportPanel({ report }: { report: CampaignReport }) {
  const openRate = report.delivered > 0 ? `${Math.round((report.opened / report.delivered) * 100)}%` : "—";
  return (
    <div className="u-stack u-gap-4">
      <div className="admin-kpi-grid">
        <MetricCard label="Assets live" value={String(report.assetsLive)} sub={`of ${report.assetsTotal} planned`} />
        <MetricCard label="Emails delivered" value={report.delivered.toLocaleString()} sub={`${report.broadcasts.length} broadcast${report.broadcasts.length === 1 ? "" : "s"}`} />
        <MetricCard label="Open rate" value={openRate} sub={`${report.opened.toLocaleString()} opened`} />
        <MetricCard label="Clicks" value={report.clicked.toLocaleString()} sub="link clicks" />
      </div>

      <div className="admin-campaign-report-split">
        <section className="admin-card admin-section-card">
          <div className="admin-card-title">Email (Broadcasts)</div>
          {report.broadcasts.length === 0 ? (
            <div className="admin-cell-muted u-mt-2">No broadcasts in this campaign yet.</div>
          ) : (
            <div className="u-mt-3">
              {report.broadcasts.map((b) => (
                <div key={b.id} className="admin-campaign-report-row">
                  <span className="u-grow">{b.title}</span>
                  <span className="admin-cell-mono u-sm">
                    {b.sent > 0 ? `${b.sent.toLocaleString()} sent · ${b.openRate ?? "—"}% open` : b.status ?? "draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card admin-section-card">
          <div className="admin-card-title">Content (Blog · Social)</div>
          {report.content.filter((c) => c.channel !== "email").length === 0 ? (
            <div className="admin-cell-muted u-mt-2">No content assets yet.</div>
          ) : (
            <div className="u-mt-3">
              {report.content
                .filter((c) => c.channel !== "email")
                .map((c) => (
                  <div key={c.channel} className="admin-campaign-report-row">
                    <span className="u-grow u-caps">{c.channel}</span>
                    <span className="admin-cell-mono u-sm">
                      {c.published} / {c.total} published
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
