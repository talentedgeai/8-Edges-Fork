import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getBroadcast, getBroadcastStats, listRecipients, type BroadcastStatus } from "@/entities/company-os/modules/campaigns/broadcasts";
import { listBrands, listEntries } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { featuredPostIds, getBroadcastLinkStats, getBroadcastUnsubscribes } from "@/entities/company-os/modules/campaigns/broadcast-report";
import { loadLetter } from "@/entities/company-os/modules/campaigns/letter/data";
import { resolveBroadcastBlocks } from "@/entities/company-os/modules/campaigns/broadcast-blocks";
import { personaliseBody, renderBroadcast, utmCampaignFor } from "@/entities/site";
import { LetterAgentPanel, type LetterAgentState } from "./LetterAgentPanel";
import { BroadcastPreview } from "./BroadcastPreview";
import { listBrandProfiles } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { BroadcastEditor } from "./BroadcastEditor";

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

// "12% of delivered" under a count; blank until there is a denominator.
function rate(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "";
}

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

  const [stats, recipients, brands, profiles, entries, featured, linkStats, letter, unsubscribes] = await Promise.all([
    getBroadcastStats(campaign.id),
    listRecipients(campaign.id),
    listBrands(),
    listBrandProfiles(),
    listEntries(),
    featuredPostIds(),
    getBroadcastLinkStats(campaign.id),
    loadLetter(campaign.id),
    getBroadcastUnsubscribes(campaign.id, campaign.approvedAt),
  ]);
  // The preview is the send's own render: same template, same blocks, tracking
  // on, the greeting as a contact without a first name sees it.
  const preview = await renderBroadcast({
    subject: campaign.subject,
    preheader: campaign.preheader,
    bodyMd: personaliseBody(campaign.bodyMd, null),
    blocks: await resolveBroadcastBlocks(campaign.blocks),
    unsubscribeLink: "https://www.edge8.ai/unsubscribe/?token=preview",
    utmCampaign: utmCampaignFor({ subject: campaign.subject, date: campaign.scheduledAt ?? new Date().toISOString() }),
  });
  const agent: LetterAgentState = letter.ok
    ? { step: letter.data.agentStep, error: letter.data.agentError, startedAt: letter.data.agentStartedAt, checklist: letter.data.notes.checklist ?? [], testSentTo: letter.data.notes.testSentTo ?? null, gathered: letter.data.notes.gathered?.length ?? 0 }
    : { step: null, error: null, startedAt: null, checklist: [], testSentTo: null, gathered: 0 };

  // Published blog posts the editor can feature, newest first; scoped to the
  // broadcast's brand when it has one, since a post links to its brand's site.
  // Posts already featured in a broadcast that went out are marked, not hidden.
  const posts = entries.rows
    .filter((e) => e.channel === "blog" && e.status === "published" && (!campaign.brandId || e.brandId === campaign.brandId))
    .sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""))
    .map((e) => ({ id: e.id, title: e.title, publishDate: e.publishDate, sent: featured.has(e.id) && !campaign.blocks.posts.includes(e.id) }));

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
        <MetricCard label="Opens" value={stats.opened.toLocaleString()} sub={rate(stats.opened, stats.delivered)} />
        <MetricCard label="Clicks" value={stats.clicked.toLocaleString()} sub={rate(stats.clicked, stats.delivered)} />
        <MetricCard label="Unsubscribes" value={unsubscribes.toLocaleString()} sub={rate(unsubscribes, stats.sent)} />
        <MetricCard label="Failed" value={stats.failed.toLocaleString()} sub="send errored" />
      </div>

      {hasSent && (
        <section className="admin-card admin-section-card">
          <div className="admin-card-title">Results</div>
          <div className="admin-kpi-grid u-mt-3 u-mb-0">
            <MetricCard label="Delivered" value={stats.delivered.toLocaleString()} sub={rate(stats.delivered, stats.sent)} />
            <MetricCard label="Bounced" value={stats.bounced.toLocaleString()} sub={rate(stats.bounced, stats.sent)} />
            <MetricCard label="Skipped" value={stats.skipped.toLocaleString()} sub="suppressed at send time" />
          </div>
          {stats.delivered === 0 && (
            <div className="admin-hint u-mt-3">
              Delivery data arrives from the Resend webhook. If these stay at zero after a send,
              the webhook is not registered or RESEND_WEBHOOK_SECRET is missing.
            </div>
          )}
          {linkStats.length > 0 && (
            <div className="admin-table-wrap u-mt-3">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Link</th>
                    <th>People</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {linkStats.map((row) => (
                    <tr key={row.content}>
                      <td className="admin-cell-strong">{row.content}</td>
                      <td>{row.people.toLocaleString()}</td>
                      <td>{row.clicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <BroadcastPreview html={preview.html} text={preview.text} />

      <LetterAgentPanel campaignId={campaign.id} status={campaign.status} brandId={campaign.brandId} agent={agent} />

      <BroadcastEditor campaign={campaign} pendingCount={stats.pending} brands={brands} profiles={profiles} posts={posts} />

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
