import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { requireAdmin } from "@/lib/admin-auth";
import { getBroadcast, getBroadcastStats, listRecipients, type BroadcastStatus } from "@/lib/admin/broadcasts";
import { listBrands } from "@/lib/admin/marketing-calendar";
import { listBrandProfiles } from "@/lib/admin/brand-profiles";
import { BroadcastEditor } from "./BroadcastEditor";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Broadcast",
  description: "Compose, approve, and send a marketing broadcast.",
};

const STATUS_TONE: Record<BroadcastStatus, "ok" | "warn" | "err" | "info"> = {
  draft: "info",
  approved: "warn",
  sending: "warn",
  sent: "ok",
  cancelled: "err",
};

const RECIPIENT_TONE: Record<string, "ok" | "warn" | "err" | "info"> = {
  sent: "ok",
  pending: "info",
  skipped: "warn",
  failed: "err",
};

export default async function BroadcastDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const campaign = await getBroadcast(params.id);
  if (!campaign) notFound();

  const [stats, recipients, brands, profiles] = await Promise.all([
    getBroadcastStats(campaign.id),
    listRecipients(campaign.id),
    listBrands(),
    listBrandProfiles(),
  ]);

  const hasSent = stats.sent > 0;

  return (
    <div>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/marketing">Marketing</Link> ·{" "}
            <Link href="/admin/revenue/marketing/broadcasts">Broadcasts</Link> · {campaign.subject}
          </>
        }
        title={campaign.name}
        action={<Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>}
      />

      <div className="admin-kpi-grid">
        <MetricCard label="Queued" value={stats.pending.toLocaleString()} sub="not yet sent" />
        <MetricCard label="Sent" value={stats.sent.toLocaleString()} sub={`of ${stats.total.toLocaleString()}`} />
        <MetricCard
          label="Skipped"
          value={stats.skipped.toLocaleString()}
          sub="suppressed at send time"
        />
        <MetricCard label="Failed" value={stats.failed.toLocaleString()} sub="send errored" />
      </div>

      {hasSent && (
        <section className="admin-card admin-section-card">
          <div className="admin-card-title">Results</div>
          <div className="admin-kpi-grid u-mt-3 u-mb-0">
            <MetricCard label="Delivered" value={stats.delivered.toLocaleString()} />
            <MetricCard label="Bounced" value={stats.bounced.toLocaleString()} />
            <MetricCard label="Opened" value={stats.opened.toLocaleString()} />
            <MetricCard label="Clicked" value={stats.clicked.toLocaleString()} />
          </div>
          {stats.delivered === 0 && (
            <div className="admin-hint u-mt-3">
              Delivery data arrives from the Resend webhook. If these stay at zero after a send,
              the webhook is not registered or RESEND_WEBHOOK_SECRET is missing.
            </div>
          )}
        </section>
      )}

      <BroadcastEditor campaign={campaign} pendingCount={stats.pending} brands={brands} profiles={profiles} />

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Recipients</div>
        <div className="admin-table-wrap u-mt-3">
          {recipients.length === 0 ? (
            <div className="admin-empty">
              No recipients yet. Pick an audience above and build the list.
            </div>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-cell-strong">
                        <Link href={`/admin/contacts/${row.personId}`}>{row.name || "—"}</Link>
                      </td>
                      <td className="admin-cell-muted">{row.email}</td>
                      <td>
                        <Badge tone={RECIPIENT_TONE[row.status] ?? "info"}>{row.status}</Badge>
                      </td>
                      <td className="admin-cell-muted">{row.skipReason || row.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
