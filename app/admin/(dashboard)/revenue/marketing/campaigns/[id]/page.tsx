import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/components/admin/PageHead";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaign, getCampaignReport } from "@/lib/admin/marketing-campaigns";
import { listBrands, listPillars, listEntriesByCampaign } from "@/lib/admin/marketing-calendar";
import { CampaignHub } from "./CampaignHub";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Campaign",
  description: "One campaign: the idea, its assets across every channel, and the plan.",
};

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  const [entries, brands, pillars, report] = await Promise.all([
    listEntriesByCampaign(campaign.id),
    listBrands(),
    listPillars(),
    getCampaignReport(campaign.id),
  ]);

  return (
    <div>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/marketing">Marketing</Link> ·{" "}
            <Link href="/admin/revenue/marketing/campaigns">Campaigns</Link> ·{" "}
            {campaign.brandName ?? "No brand"}
          </>
        }
        title={campaign.name}
      />
      <CampaignHub campaign={campaign} entries={entries} report={report} brands={brands} pillars={pillars} />
    </div>
  );
}
