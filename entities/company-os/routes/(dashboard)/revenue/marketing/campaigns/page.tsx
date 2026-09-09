import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listCampaigns } from "@/entities/company-os/modules/campaigns/marketing-campaigns";
import { listBrands, listPillars, listEntries } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { NewCampaignButton } from "./NewCampaignButton";
import { CampaignsView } from "./CampaignsView";

export const metadata: Metadata = {
  title: "Campaigns",
  description: "Founder-led campaigns: one idea, assets across every channel.",
};

export default async function CampaignsPage() {
  await requireAdmin();
  const [{ rows, error }, brands, pillars, { rows: allEntries }] = await Promise.all([
    listCampaigns(),
    listBrands(),
    listPillars(),
    listEntries(),
  ]);

  // The calendar view is a view of campaign assets, so it only shows entries
  // that belong to a campaign.
  const campaignEntries = allEntries.filter((e) => e.campaignId);

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Campaigns"
        sub={`${rows.length} campaign${rows.length === 1 ? "" : "s"}. A campaign is the idea; it spawns assets across every channel.`}
        action={<NewCampaignButton brands={brands} pillars={pillars} />}
      />

      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="admin-table-wrap">
          <div className="admin-empty">No campaigns yet. Start one with “+ New campaign”.</div>
        </div>
      ) : (
        <CampaignsView rows={rows} entries={campaignEntries} />
      )}
    </div>
  );
}
