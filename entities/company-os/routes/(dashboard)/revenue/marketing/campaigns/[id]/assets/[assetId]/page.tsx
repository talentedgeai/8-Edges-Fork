import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getEntry, listEntriesByCampaign, CHANNEL_LABEL } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { listAssetImages } from "@/entities/company-os/modules/campaigns/marketing-images";
import { marketingMarkdownToHtml } from "@/entities/company-os/modules/campaigns/markdown";
import { ContentDetail } from "./ContentDetail";

export const metadata: Metadata = {
  title: "Asset",
  description: "One content asset: its copy and images.",
};

export default async function AssetDetailPage({
  params,
}: {
  params: { id: string; assetId: string };
}) {
  await requireAdmin();
  const entry = await getEntry(params.assetId);
  // The asset must exist and belong to this campaign.
  if (!entry || entry.campaignId !== params.id) notFound();

  const [images, html, siblings] = await Promise.all([
    listAssetImages(entry.id),
    marketingMarkdownToHtml(entry.copyMd ?? ""),
    listEntriesByCampaign(params.id),
  ]);

  return (
    <div>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/marketing">Marketing</Link> ·{" "}
            <Link href="/admin/revenue/marketing/campaigns">Campaigns</Link> ·{" "}
            <Link href={`/admin/revenue/marketing/campaigns/${params.id}`}>
              {entry.campaignName ?? "Campaign"}
            </Link>{" "}
            · {CHANNEL_LABEL[entry.channel]}
          </>
        }
        title={entry.title}
      />

      {/* Campaign context: this piece sits within the campaign. Jump between its
          other assets without leaving. */}
      {siblings.length > 1 && (
        <div className="admin-campaign-sibling-nav">
          <span className="admin-campaign-sibling-label">In this campaign</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/admin/revenue/marketing/campaigns/${params.id}/assets/${s.id}`}
              className={`admin-chip${s.id === entry.id ? " admin-chip--accent" : ""}`}
              aria-current={s.id === entry.id ? "page" : undefined}
            >
              {CHANNEL_LABEL[s.channel]}
            </Link>
          ))}
        </div>
      )}

      <ContentDetail
        campaignId={params.id}
        entry={entry}
        initialHtml={html}
        initialImages={images}
      />
    </div>
  );
}
