import { companyOs } from "@/lib/supabase";
import { getBroadcastStats } from "@/lib/admin/broadcasts";
import type { CalendarChannel, CalendarStatus } from "@/lib/admin/marketing-calendar";

// Reads for the campaign umbrella: a campaign is the founder's idea (goal, dates,
// pillar, SEO/GEO plan) that spawns assets across channels. Assets are
// marketing_calendar rows linked by campaign_id. The volume is small (one team's
// plan), so these list without paging.

export type MarketingCampaignStatus = "draft" | "active" | "done" | "archived";

export const CAMPAIGN_STATUSES: { id: MarketingCampaignStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Active" },
  { id: "done", label: "Done" },
  { id: "archived", label: "Archived" },
];

// Asset statuses that count as "built" (past the drafting stage) for the
// campaign progress bar.
const BUILT_STATUSES = new Set<CalendarStatus>(["approved", "scheduled", "published"]);

// Channel display order.
const CHANNEL_ORDER: CalendarChannel[] = ["blog", "email", "linkedin", "facebook"];

export type MarketingCampaignRow = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  seoGeoMd: string | null;
  status: MarketingCampaignStatus;
  brandId: string | null;
  brandName: string | null;
  pillarId: string | null;
  pillarName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  assetCount: number;
  builtCount: number;
  channels: CalendarChannel[];
};

type DbCampaign = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  seo_geo_md: string | null;
  status: string;
  brand_id: string | null;
  pillar_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  brands: { name: string } | { name: string }[] | null;
  marketing_pillars: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const CAMPAIGN_SELECT =
  "id, name, idea, objective, seo_geo_md, status, brand_id, pillar_id, starts_on, ends_on, created_at, brands(name), marketing_pillars(name)";

type AssetAgg = { count: number; built: number; channels: Set<string> };

function aggregate(assets: { campaign_id: string | null; channel: string; status: string }[]): Map<string, AssetAgg> {
  const byCampaign = new Map<string, AssetAgg>();
  for (const a of assets) {
    if (!a.campaign_id) continue;
    // Skipped assets were abandoned, not built: excluding them from the
    // denominator keeps progress honest (otherwise a campaign with any skipped
    // asset could never reach 100%).
    if (a.status === "skipped") continue;
    const acc = byCampaign.get(a.campaign_id) ?? { count: 0, built: 0, channels: new Set<string>() };
    acc.count += 1;
    if (BUILT_STATUSES.has(a.status as CalendarStatus)) acc.built += 1;
    acc.channels.add(a.channel);
    byCampaign.set(a.campaign_id, acc);
  }
  return byCampaign;
}

function mapCampaign(c: DbCampaign, agg: AssetAgg | undefined): MarketingCampaignRow {
  const channels = agg ? CHANNEL_ORDER.filter((ch) => agg.channels.has(ch)) : [];
  return {
    id: c.id,
    name: c.name,
    idea: c.idea,
    objective: c.objective,
    seoGeoMd: c.seo_geo_md,
    status: c.status as MarketingCampaignStatus,
    brandId: c.brand_id,
    brandName: one(c.brands)?.name ?? null,
    pillarId: c.pillar_id,
    pillarName: one(c.marketing_pillars)?.name ?? null,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    createdAt: c.created_at,
    assetCount: agg?.count ?? 0,
    builtCount: agg?.built ?? 0,
    channels,
  };
}

export async function listCampaigns(): Promise<{ rows: MarketingCampaignRow[]; error?: string }> {
  const { data, error } = await companyOs
    .from("marketing_campaigns")
    .select(CAMPAIGN_SELECT)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };

  const { data: assetData } = await companyOs
    .from("marketing_content")
    .select("campaign_id, channel, status")
    .not("campaign_id", "is", null);
  const agg = aggregate((assetData ?? []) as { campaign_id: string | null; channel: string; status: string }[]);

  const rows = ((data ?? []) as DbCampaign[]).map((c) => mapCampaign(c, agg.get(c.id)));
  return { rows };
}

export async function getCampaign(id: string): Promise<MarketingCampaignRow | null> {
  const { data, error } = await companyOs
    .from("marketing_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const { data: assetData } = await companyOs
    .from("marketing_content")
    .select("campaign_id, channel, status")
    .eq("campaign_id", id);
  const agg = aggregate((assetData ?? []) as { campaign_id: string | null; channel: string; status: string }[]);
  return mapCampaign(data as DbCampaign, agg.get(id));
}

export type CampaignOption = { id: string; name: string };

// Light list for the calendar's campaign filter.
export async function listCampaignOptions(): Promise<CampaignOption[]> {
  const { data } = await companyOs
    .from("marketing_campaigns")
    .select("id, name")
    .order("created_at", { ascending: false });
  return (data ?? []) as CampaignOption[];
}

// ---------------------------------------------------------------- report

export type CampaignReportBroadcast = {
  id: string;
  title: string;
  status: string | null;
  sent: number;
  delivered: number;
  openRate: number | null;
};

export type CampaignReport = {
  assetsLive: number;
  assetsTotal: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  broadcasts: CampaignReportBroadcast[];
  content: { channel: CalendarChannel; published: number; total: number }[];
};

// One rolled-up read across a campaign's channels: email delivery stats summed
// from each linked broadcast, plus content published/total per channel. Loops
// one stats read per broadcast, fine at this volume.
export async function getCampaignReport(campaignId: string): Promise<CampaignReport> {
  const { data } = await companyOs
    .from("marketing_content")
    .select("id, title, channel, status, broadcast_id, email_campaigns!broadcast_id(status)")
    .eq("campaign_id", campaignId);

  type Row = {
    id: string;
    title: string;
    channel: string;
    status: string;
    broadcast_id: string | null;
    email_campaigns: { status: string } | { status: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  let assetsLive = 0;
  let sent = 0;
  let delivered = 0;
  let opened = 0;
  let clicked = 0;
  const broadcasts: CampaignReportBroadcast[] = [];
  const contentMap = new Map<CalendarChannel, { published: number; total: number }>();

  for (const r of rows) {
    const ch = r.channel as CalendarChannel;
    const cm = contentMap.get(ch) ?? { published: 0, total: 0 };
    cm.total += 1;
    if (r.status === "published") {
      cm.published += 1;
      assetsLive += 1;
    }
    contentMap.set(ch, cm);

    if (r.channel === "email" && r.broadcast_id) {
      const s = await getBroadcastStats(r.broadcast_id);
      sent += s.sent;
      delivered += s.delivered;
      opened += s.opened;
      clicked += s.clicked;
      broadcasts.push({
        id: r.broadcast_id,
        title: r.title,
        status: one(r.email_campaigns)?.status ?? null,
        sent: s.sent,
        delivered: s.delivered,
        openRate: s.delivered > 0 ? Math.round((s.opened / s.delivered) * 100) : null,
      });
    }
  }

  const content = CHANNEL_ORDER.filter((ch) => contentMap.has(ch)).map((ch) => ({
    channel: ch,
    ...contentMap.get(ch)!,
  }));

  return { assetsLive, assetsTotal: rows.length, sent, delivered, opened, clicked, broadcasts, content };
}
