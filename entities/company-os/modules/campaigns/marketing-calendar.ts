import { companyOs } from "@/kernel/data/supabase";
import { getBroadcastStats } from "@/entities/company-os/modules/campaigns/broadcasts";
import {
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_PROPOSAL,
  STAGE_CONTRACT,
  STAGE_WON,
  STAGE_LOST,
} from "@/entities/company-os/lib/stageColors";

// Marketing calendar reads. The page is tiny (one team's content plan), so this
// lists every entry and the views filter client-side — no paging needed.

export type CalendarChannel = "blog" | "email" | "linkedin" | "facebook";
export type CalendarStatus =
  | "idea"
  | "drafted"
  | "approved"
  | "scheduled"
  | "published"
  | "skipped";

// Board columns, in flow order. Accents mirror the pipeline palette
// (stageColors) since the kanban consumes them as inline-style strings.
export const STATUSES: { id: CalendarStatus; label: string; accent: string }[] = [
  { id: "idea", label: "Idea", accent: STAGE_NEUTRAL },
  { id: "drafted", label: "Drafted", accent: STAGE_LEAD },
  { id: "approved", label: "Approved", accent: STAGE_PROPOSAL },
  { id: "scheduled", label: "Scheduled", accent: STAGE_CONTRACT },
  { id: "published", label: "Published", accent: STAGE_WON },
  { id: "skipped", label: "Skipped", accent: STAGE_LOST },
];

// Channel accents are the platform's own identity color, used only as a chip
// tint so a month grid is scannable by channel. Raw hex mirrors stageColors.
export const CHANNELS: { id: CalendarChannel; label: string; accent: string }[] = [
  { id: "blog", label: "Blog", accent: "var(--admin-muted)" },
  { id: "email", label: "Email", accent: "var(--admin-accent)" },
  { id: "linkedin", label: "LinkedIn", accent: "var(--admin-chart-3)" },
  { id: "facebook", label: "Facebook", accent: "var(--admin-chart-6)" },
];

export const STATUS_LABEL: Record<CalendarStatus, string> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s.label]),
) as Record<CalendarStatus, string>;
export const CHANNEL_LABEL: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.label]),
) as Record<CalendarChannel, string>;
export const CHANNEL_ACCENT: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.accent]),
) as Record<CalendarChannel, string>;

export type BrandOption = { id: string; name: string; slug: string };
export type PillarOption = { id: string; brandId: string; name: string };

export type CalendarEntryRow = {
  id: string;
  title: string;
  brandId: string | null;
  brandName: string | null;
  pillarId: string | null;
  pillarName: string | null;
  channel: CalendarChannel;
  status: CalendarStatus;
  publishDate: string | null; // YYYY-MM-DD
  parentId: string | null;
  // The email-send link (email_campaigns). Named "broadcast" since PR 2.
  broadcastId: string | null;
  broadcastStatus: string | null;
  // The umbrella campaign (marketing_campaigns) this asset belongs to.
  campaignId: string | null;
  campaignName: string | null;
  copyMd: string | null;
  assetUrl: string | null;
  postedUrl: string | null;
  notes: string | null;
  blogStyle: string | null;
  socialStyle: string | null;
  imageStyle: string | null;
  imageType: string | null;
  seoMd: string | null;
  imageBriefMd: string | null;
  imageUrl: string | null;
  bodyHtml: string | null;
  sortOrder: number;
  createdAt: string;
};

type DbEntry = {
  id: string;
  title: string;
  brand_id: string | null;
  pillar_id: string | null;
  channel: string;
  status: string;
  publish_date: string | null;
  parent_id: string | null;
  broadcast_id: string | null;
  campaign_id: string | null;
  copy_md: string | null;
  asset_url: string | null;
  posted_url: string | null;
  notes: string | null;
  blog_style: string | null;
  social_style: string | null;
  image_style: string | null;
  image_type: string | null;
  seo_md: string | null;
  image_brief_md: string | null;
  image_url: string | null;
  body_html: string | null;
  sort_order: number;
  created_at: string;
  brands: { name: string } | { name: string }[] | null;
  marketing_pillars: { name: string } | { name: string }[] | null;
  email_campaigns: { status: string } | { status: string }[] | null;
  marketing_campaigns: { name: string } | { name: string }[] | null;
};

// broadcast_id is the email-send link; campaign_id is the umbrella. Both embeds
// are pinned to their FK explicitly so they stay unambiguous.
const ENTRY_SELECT =
  "id, title, brand_id, pillar_id, channel, status, publish_date, parent_id, broadcast_id, campaign_id, copy_md, asset_url, posted_url, notes, blog_style, social_style, image_style, image_type, seo_md, image_brief_md, image_url, body_html, sort_order, created_at, brands(name), marketing_pillars(name), email_campaigns!broadcast_id(status), marketing_campaigns!campaign_id(name)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function mapEntry(row: DbEntry): CalendarEntryRow {
  const brand = one(row.brands);
  const pillar = one(row.marketing_pillars);
  const broadcast = one(row.email_campaigns);
  const campaign = one(row.marketing_campaigns);
  return {
    id: row.id,
    title: row.title,
    brandId: row.brand_id,
    brandName: brand?.name ?? null,
    pillarId: row.pillar_id,
    pillarName: pillar?.name ?? null,
    channel: row.channel as CalendarChannel,
    status: row.status as CalendarStatus,
    publishDate: row.publish_date,
    parentId: row.parent_id,
    broadcastId: row.broadcast_id,
    broadcastStatus: broadcast?.status ?? null,
    campaignId: row.campaign_id,
    campaignName: campaign?.name ?? null,
    copyMd: row.copy_md,
    assetUrl: row.asset_url,
    postedUrl: row.posted_url,
    notes: row.notes,
    blogStyle: row.blog_style,
    socialStyle: row.social_style,
    imageStyle: row.image_style,
    imageType: row.image_type,
    seoMd: row.seo_md,
    imageBriefMd: row.image_brief_md,
    imageUrl: row.image_url,
    bodyHtml: row.body_html,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listEntries(): Promise<{ rows: CalendarEntryRow[]; error?: string }> {
  const { data, error } = await companyOs
    .from("marketing_content")
    .select(ENTRY_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as DbEntry[]).map(mapEntry) };
}

// A single calendar row (asset) with all its joined fields.
export async function getEntry(id: string): Promise<CalendarEntryRow | null> {
  const { data, error } = await companyOs
    .from("marketing_content")
    .select(ENTRY_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapEntry(data as unknown as DbEntry);
}

// The full calendar rows for one campaign's assets, so the campaign hub can
// render the same board and month grid the global calendar uses.
export async function listEntriesByCampaign(campaignId: string): Promise<CalendarEntryRow[]> {
  const { data } = await companyOs
    .from("marketing_content")
    .select(ENTRY_SELECT)
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as DbEntry[]).map(mapEntry);
}

export async function listBrands(): Promise<BrandOption[]> {
  const { data } = await companyOs
    .from("brands")
    .select("id, name, slug")
    .eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []) as BrandOption[];
}

export type PillarPerformance = {
  pillar: string;
  campaigns: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

// Rolls broadcast delivery stats up by pillar, counting distinct campaigns (not
// individual sends) so the "campaigns" column reflects the umbrella. A broadcast
// with no campaign counts as its own unit, so nothing is dropped. Loops one
// stats read per broadcast — fine at this volume; revisit with an aggregate RPC
// if the count grows large.
export async function getPillarPerformance(): Promise<PillarPerformance[]> {
  const { data } = await companyOs
    .from("marketing_content")
    .select("broadcast_id, campaign_id, marketing_pillars(name)")
    .eq("channel", "email")
    .not("broadcast_id", "is", null);

  const rows = (data ?? []) as unknown as {
    broadcast_id: string;
    campaign_id: string | null;
    marketing_pillars: { name: string } | { name: string }[] | null;
  }[];

  type Acc = Omit<PillarPerformance, "campaigns"> & { units: Set<string> };
  const byPillar = new Map<string, Acc>();
  for (const row of rows) {
    const stats = await getBroadcastStats(row.broadcast_id);
    if (stats.sent === 0) continue;
    const key = one(row.marketing_pillars)?.name ?? "Unassigned";
    const acc =
      byPillar.get(key) ??
      { pillar: key, sent: 0, delivered: 0, opened: 0, clicked: 0, units: new Set<string>() };
    acc.units.add(row.campaign_id ?? `broadcast:${row.broadcast_id}`);
    acc.sent += stats.sent;
    acc.delivered += stats.delivered;
    acc.opened += stats.opened;
    acc.clicked += stats.clicked;
    byPillar.set(key, acc);
  }

  return [...byPillar.values()]
    .map(({ units, ...rest }) => ({ ...rest, campaigns: units.size }))
    .sort((a, b) => b.clicked - a.clicked);
}

export async function listPillars(): Promise<PillarOption[]> {
  const { data } = await companyOs
    .from("marketing_pillars")
    .select("id, brand_id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  return ((data ?? []) as { id: string; brand_id: string; name: string }[]).map((p) => ({
    id: p.id,
    brandId: p.brand_id,
    name: p.name,
  }));
}
