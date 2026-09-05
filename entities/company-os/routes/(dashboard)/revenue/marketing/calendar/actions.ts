"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { getBroadcastStats } from "@/entities/company-os/modules/campaigns/broadcasts";
import { writeForBrand, fetchSourceText } from "@/entities/company-os/modules/campaigns/ai/brand-writer";
import { generateEntryImage } from "@/entities/company-os/modules/campaigns/ai/brand-image";
import { listAssetImages, setSelectedImage, type AssetImage } from "@/entities/company-os/modules/campaigns/marketing-images";
import { publishBlogAsset, revalidateBlog } from "@/entities/company-os/modules/campaigns/blog-publish";
import {
  listEntries,
  type CalendarChannel,
  type CalendarEntryRow,
  type CalendarStatus,
  type PillarOption,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { addDays } from "@/kernel/config/dates";

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type BroadcastResult = { ok: true; broadcastId: string } | { ok: false; error: string };
type RepurposeResult = { ok: true; entries: CalendarEntryRow[] } | { ok: false; error: string };
type PillarResult = { ok: true; pillar: PillarOption } | { ok: false; error: string };

// The repurposing waterfall: a core asset (usually blog) becomes social + email
// derivatives, staggered over the following days.
const DERIVATIVES: { channel: CalendarChannel; offsetDays: number }[] = [
  { channel: "linkedin", offsetDays: 1 },
  { channel: "facebook", offsetDays: 2 },
  { channel: "email", offsetDays: 4 },
];

// The single place a calendar entry mints a draft broadcast (email_campaigns row)
// and links it back via broadcast_id. Shared by createBroadcastFromEntry (the
// "Create broadcast" button) and the email branch of draftWithAI, so the row
// shape and the link step cannot drift apart. Returns the new broadcast id, or
// null if the insert produced no row.
async function createDraftBroadcastForEntry(input: {
  entryId: string;
  name: string;
  subject: string;
  preheader?: string | null;
  bodyMd?: string | null;
  brandId: string | null;
  publishDate: string | null;
  createdBy: string;
}): Promise<string | null> {
  const row: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    brand_id: input.brandId,
    // A date-only publish target becomes 09:00 UTC as a sane default; the
    // operator refines it in the broadcast editor.
    scheduled_at: input.publishDate ? `${input.publishDate}T09:00:00Z` : null,
    created_by: input.createdBy,
  };
  if (input.preheader !== undefined) row.preheader = input.preheader;
  if (input.bodyMd !== undefined) row.body_md = input.bodyMd;

  const { data } = await companyOs.from("email_campaigns").insert(row).select("id").maybeSingle();
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) {
    await companyOs.from("marketing_content").update({ broadcast_id: id }).eq("id", input.entryId);
  }
  return id;
}

const CHANNELS = new Set<CalendarChannel>(["blog", "email", "linkedin", "facebook"]);
const STATUSES = new Set<CalendarStatus>([
  "idea",
  "drafted",
  "approved",
  "scheduled",
  "published",
  "skipped",
]);

function refresh() {
  revalidatePath("/admin/revenue/marketing/calendar");
}

export async function createEntry(input: {
  title: string;
  channel: string;
  brandId?: string | null;
  publishDate?: string | null;
  pillarId?: string | null;
}): Promise<CreateResult> {
  const admin = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the entry a title." };
  if (!CHANNELS.has(input.channel as CalendarChannel)) {
    return { ok: false, error: "Pick a channel." };
  }

  const { data, error } = await companyOs
    .from("marketing_content")
    .insert({
      title,
      channel: input.channel,
      brand_id: input.brandId || null,
      publish_date: input.publishDate || null,
      pillar_id: input.pillarId || null,
      created_by: admin.email,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Entry was not created." };

  const id = (data as { id: string }).id;
  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "insert",
    actor: admin.email,
    context: { title, channel: input.channel },
  });
  refresh();
  return { ok: true, id };
}

export async function updateEntry(
  id: string,
  patch: {
    title?: string;
    brandId?: string | null;
    pillarId?: string | null;
    channel?: string;
    publishDate?: string | null;
    copyMd?: string | null;
    assetUrl?: string | null;
    notes?: string | null;
    parentId?: string | null;
    blogStyle?: string | null;
    socialStyle?: string | null;
    imageStyle?: string | null;
    imageType?: string | null;
    seoMd?: string | null;
    imageBriefMd?: string | null;
    bodyHtml?: string | null;
  },
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    update.title = t;
  }
  if (patch.brandId !== undefined) update.brand_id = patch.brandId || null;
  if (patch.pillarId !== undefined) update.pillar_id = patch.pillarId || null;
  if (patch.channel !== undefined) {
    if (!CHANNELS.has(patch.channel as CalendarChannel)) {
      return { ok: false, error: "Unknown channel." };
    }
    update.channel = patch.channel;
  }
  if (patch.publishDate !== undefined) update.publish_date = patch.publishDate || null;
  if (patch.copyMd !== undefined) update.copy_md = patch.copyMd || null;
  if (patch.assetUrl !== undefined) update.asset_url = patch.assetUrl?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes || null;
  if (patch.parentId !== undefined) {
    // An entry cannot be its own parent.
    update.parent_id = patch.parentId && patch.parentId !== id ? patch.parentId : null;
  }
  if (patch.blogStyle !== undefined) update.blog_style = patch.blogStyle || null;
  if (patch.socialStyle !== undefined) update.social_style = patch.socialStyle || null;
  if (patch.imageStyle !== undefined) update.image_style = patch.imageStyle || null;
  if (patch.imageType !== undefined) update.image_type = patch.imageType || null;
  if (patch.seoMd !== undefined) update.seo_md = patch.seoMd || null;
  if (patch.imageBriefMd !== undefined) update.image_brief_md = patch.imageBriefMd || null;
  if (patch.bodyHtml !== undefined) update.body_html = patch.bodyHtml || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await companyOs.from("marketing_content").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { fields: Object.keys(update) },
  });
  refresh();
  return { ok: true };
}

export async function moveEntry(
  id: string,
  status: string,
  sortOrder?: number,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!STATUSES.has(status as CalendarStatus)) {
    return { ok: false, error: "Unknown status." };
  }

  // If this is a published blog asset moving OUT of published (unpublish), we
  // need its slug to revalidate the public surfaces after the change.
  const { data: before } = await companyOs
    .from("marketing_content")
    .select("channel, status, slug")
    .eq("id", id)
    .maybeSingle();

  const update: Record<string, unknown> = { status };
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) update.sort_order = sortOrder;

  const { error } = await companyOs.from("marketing_content").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const prev = before as { channel: string; status: string; slug: string | null } | null;
  if (prev?.channel === "blog" && prev.slug && prev.status === "published" && status !== "published") {
    revalidateBlog(prev.slug);
  }

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { status },
  });
  refresh();
  return { ok: true };
}

// Publish a blog asset to the public site as a data event: validate, normalize
// the SEO fields into columns, flip to published, revalidate, verify the live
// URL. No git, no deploy. (Social channels keep using markPosted.) The heavy
// lifting is in lib/marketing/blog-publish so the Publish Editor agent reuses it.
export async function publishBlogEntry(
  id: string,
): Promise<{ ok: true; slug: string; liveUrl: string; verified: boolean; warning?: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const result = await publishBlogAsset(id, admin.email);
  refresh();
  if (!result.ok) return { ok: false, error: result.errors.join(" ") };
  return { ok: true, slug: result.slug, liveUrl: result.liveUrl, verified: result.verified, warning: result.warning };
}

// Manual social path: record where a blog/LinkedIn/Facebook entry went live and
// move it to 'published'. URL is optional (a post may have no shareable link).
export async function markPosted(id: string, url: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await companyOs
    .from("marketing_content")
    .update({ status: "published", posted_url: url.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { status: "published", posted: true },
  });
  refresh();
  return { ok: true };
}

// Delivery numbers for an entry's linked campaign, fetched lazily when the
// drawer opens (so the board list doesn't pay for stats it isn't showing).
export type EntryPerformance = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

export async function getEntryPerformance(broadcastId: string): Promise<EntryPerformance> {
  await requireAdmin();
  const s = await getBroadcastStats(broadcastId);
  return { sent: s.sent, delivered: s.delivered, opened: s.opened, clicked: s.clicked };
}

type ImagesResult = { ok: true; images: AssetImage[]; url: string } | { ok: false; error: string };

// Generates an image for the entry from its brief + style + the brand palette.
// Kept as a new selected version in the image library (marketing_asset_images);
// image_url mirrors the selection. Returns the full version list for the drawer.
export async function generateImage(id: string): Promise<ImagesResult> {
  const admin = await requireAdmin();
  const r = await generateEntryImage(id, { createdBy: admin.email });
  if (!r.ok) return r;
  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { image_generated: true },
  });
  refresh();
  return { ok: true, url: r.url, images: await listAssetImages(id) };
}

// The image library (all kept versions) for one entry, newest first.
export async function getEntryImages(id: string): Promise<AssetImage[]> {
  await requireAdmin();
  return listAssetImages(id);
}

// Make an earlier version the selected one (mirrors image_url). Returns the
// refreshed list so the drawer reflects the new selection.
export async function selectEntryImage(
  id: string,
  imageId: string,
): Promise<ImagesResult> {
  const admin = await requireAdmin();
  const r = await setSelectedImage(id, imageId);
  if (!r.ok) return r;
  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { image_selected: imageId },
  });
  refresh();
  return { ok: true, url: r.url, images: await listAssetImages(id) };
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await companyOs.from("marketing_content").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "delete",
    actor: admin.email,
  });
  refresh();
  return { ok: true };
}

export async function createPillar(brandId: string, name: string): Promise<PillarResult> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!brandId) return { ok: false, error: "Pick a brand for the pillar." };
  if (!trimmed) return { ok: false, error: "Give the pillar a name." };

  const { data, error } = await companyOs
    .from("marketing_pillars")
    .insert({ brand_id: brandId, name: trimmed, created_by: admin.email })
    .select("id, brand_id, name")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "That pillar already exists for this brand." };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Pillar was not created." };

  const row = data as { id: string; brand_id: string; name: string };
  await recordAudit({
    table: "marketing_pillars",
    recordId: row.id,
    operation: "insert",
    actor: admin.email,
    context: { name: trimmed },
  });
  refresh();
  return { ok: true, pillar: { id: row.id, brandId: row.brand_id, name: row.name } };
}

export async function deactivatePillar(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Soft-remove: entries already tagged with it keep their pillar_id.
  const { error } = await companyOs
    .from("marketing_pillars")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "marketing_pillars",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { active: false },
  });
  refresh();
  return { ok: true };
}

// Spawns channel derivatives from a core asset, each linked back via parent_id
// and dated a few days after the parent (the repurposing waterfall). Skips the
// parent's own channel. Returns the full entry list so the client re-syncs.
export async function repurposeEntry(id: string): Promise<RepurposeResult> {
  const admin = await requireAdmin();

  const { data, error } = await companyOs
    .from("marketing_content")
    .select("id, title, brand_id, channel, pillar_id, publish_date")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Entry not found." };

  const parent = data as {
    id: string;
    title: string;
    brand_id: string | null;
    channel: string;
    pillar_id: string | null;
    publish_date: string | null;
  };

  const baseDate = parent.publish_date ?? new Date().toISOString().slice(0, 10);
  const children = DERIVATIVES.filter((d) => d.channel !== parent.channel).map((d) => ({
    title: parent.title,
    brand_id: parent.brand_id,
    pillar_id: parent.pillar_id,
    channel: d.channel,
    status: "idea",
    publish_date: addDays(baseDate, d.offsetDays),
    parent_id: parent.id,
    created_by: admin.email,
  }));

  if (children.length === 0) return { ok: false, error: "Nothing to repurpose." };

  const { error: insertError } = await companyOs.from("marketing_content").insert(children);
  if (insertError) return { ok: false, error: insertError.message };

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "bulk_update",
    actor: admin.email,
    context: { repurposed_into: children.map((c) => c.channel) },
  });
  refresh();

  const { rows, error: listError } = await listEntries();
  if (listError) return { ok: false, error: listError };
  return { ok: true, entries: rows };
}

// AI draft: reads the brand's writing profile and drafts the deliverables its
// content rules call for, from this entry's source (its linked URL, or its
// title as a brief). Each output lands on a calendar entry (this one for its
// own channel, a linked child for the others), and any email output gets a
// linked draft campaign. Returns the refreshed list. Never sends anything.
export async function draftWithAI(id: string): Promise<RepurposeResult> {
  const admin = await requireAdmin();

  const { data: entryData, error: entryError } = await companyOs
    .from("marketing_content")
    .select("id, title, brand_id, channel, publish_date, asset_url, posted_url, broadcast_id")
    .eq("id", id)
    .maybeSingle();
  if (entryError) return { ok: false, error: entryError.message };
  if (!entryData) return { ok: false, error: "Entry not found." };

  const entry = entryData as {
    id: string;
    title: string;
    brand_id: string | null;
    channel: string;
    publish_date: string | null;
    asset_url: string | null;
    posted_url: string | null;
    broadcast_id: string | null;
  };
  if (!entry.brand_id) return { ok: false, error: "Set a brand on this entry first, so the writer knows the voice." };

  const sourceUrl = entry.posted_url || entry.asset_url || null;
  const sourceText = sourceUrl ? await fetchSourceText(sourceUrl) : "";

  const result = await writeForBrand({
    brandId: entry.brand_id,
    sourceText,
    sourceUrl,
    brief: entry.title,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Existing children keyed by channel, so re-running updates in place.
  const { data: childData } = await companyOs
    .from("marketing_content")
    .select("id, channel, broadcast_id")
    .eq("parent_id", id);
  const childByChannel = new Map(
    ((childData ?? []) as { id: string; channel: string; broadcast_id: string | null }[]).map((c) => [c.channel, c]),
  );

  const baseDate = entry.publish_date ?? new Date().toISOString().slice(0, 10);

  for (const out of result.outputs) {
    // The copy plus the style/SEO/image fields the writer chose for this piece.
    const fields: Record<string, unknown> = { copy_md: out.bodyMd };
    if (out.imageStyle) fields.image_style = out.imageStyle;
    if (out.imageBriefMd) fields.image_brief_md = out.imageBriefMd;
    if (out.channel === "blog") {
      if (out.blogStyle) fields.blog_style = out.blogStyle;
      if (out.seoMd) fields.seo_md = out.seoMd;
    }
    if (out.channel === "linkedin" || out.channel === "facebook") {
      if (out.socialStyle) fields.social_style = out.socialStyle;
    }

    // Where this channel's copy lands.
    let targetId: string;
    let targetCampaignId: string | null;
    if (out.channel === entry.channel) {
      await companyOs.from("marketing_content").update(fields).eq("id", entry.id);
      targetId = entry.id;
      targetCampaignId = entry.broadcast_id;
    } else {
      const existing = childByChannel.get(out.channel);
      if (existing) {
        await companyOs.from("marketing_content").update(fields).eq("id", existing.id);
        targetId = existing.id;
        targetCampaignId = existing.broadcast_id;
      } else {
        const offset = DERIVATIVES.find((d) => d.channel === out.channel)?.offsetDays ?? 1;
        const { data: created } = await companyOs
          .from("marketing_content")
          .insert({
            title: entry.title,
            brand_id: entry.brand_id,
            channel: out.channel,
            status: "drafted",
            publish_date: addDays(baseDate, offset),
            parent_id: entry.id,
            created_by: admin.email,
            ...fields,
          })
          .select("id")
          .maybeSingle();
        targetId = (created as { id: string } | null)?.id ?? entry.id;
        targetCampaignId = null;
      }
    }

    // Email deliverables also drive a draft broadcast.
    if (out.channel === "email") {
      const subject = out.subject?.trim() || entry.title;
      const preheader = out.preheader?.trim() || null;
      if (targetCampaignId) {
        // Only touch a broadcast still in draft.
        await companyOs
          .from("email_campaigns")
          .update({ subject, preheader, body_md: out.bodyMd, updated_at: new Date().toISOString() })
          .eq("id", targetCampaignId)
          .eq("status", "draft");
      } else {
        await createDraftBroadcastForEntry({
          entryId: targetId,
          name: entry.title,
          subject,
          preheader,
          bodyMd: out.bodyMd,
          brandId: entry.brand_id,
          publishDate: entry.publish_date,
          createdBy: admin.email,
        });
      }
    }
  }

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "bulk_update",
    actor: admin.email,
    context: { ai_drafted: result.outputs.map((o) => o.channel) },
  });
  refresh();

  const { rows, error: listError } = await listEntries();
  if (listError) return { ok: false, error: listError };
  return { ok: true, entries: rows };
}

// The campaign's one-click starting point. Reads the campaign's idea and its
// brand profile (the same voice, channels, and styles the Brands page edits),
// asks the writer for the full channel set, and lands one drafted asset per
// channel under the campaign. Assets are keyed by channel so re-running updates
// them in place rather than piling up duplicates. Email also spawns a draft
// broadcast, matching draftWithAI. Never sends anything.
export async function draftCampaignAssets(
  campaignId: string,
): Promise<{ ok: true; channels: string[] } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const { data: campData, error: campErr } = await companyOs
    .from("marketing_campaigns")
    .select("id, name, idea, objective, brand_id, pillar_id, starts_on")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr) return { ok: false, error: campErr.message };
  if (!campData) return { ok: false, error: "Campaign not found." };

  const campaign = campData as {
    id: string;
    name: string;
    idea: string | null;
    objective: string | null;
    brand_id: string | null;
    pillar_id: string | null;
    starts_on: string | null;
  };
  if (!campaign.brand_id) {
    return { ok: false, error: "Set a brand on this campaign first, so the writer knows the voice and channels." };
  }
  if (!campaign.idea?.trim()) {
    return { ok: false, error: "Write the campaign idea first; it is the brief the writer works from." };
  }

  // The idea is the brief; the goal and name sharpen it. The brand profile (its
  // active channels, voice, and styles) decides which assets to produce.
  const result = await writeForBrand({
    brandId: campaign.brand_id,
    sourceText: campaign.idea,
    brief: campaign.objective || campaign.name,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Existing campaign assets keyed by channel, so re-running updates in place.
  const { data: existingData } = await companyOs
    .from("marketing_content")
    .select("id, channel, broadcast_id")
    .eq("campaign_id", campaignId);
  const existingByChannel = new Map(
    ((existingData ?? []) as { id: string; channel: string; broadcast_id: string | null }[]).map((e) => [
      e.channel,
      e,
    ]),
  );

  const baseDate = campaign.starts_on ?? new Date().toISOString().slice(0, 10);

  for (const out of result.outputs) {
    const fields: Record<string, unknown> = { copy_md: out.bodyMd };
    if (out.imageStyle) fields.image_style = out.imageStyle;
    if (out.imageBriefMd) fields.image_brief_md = out.imageBriefMd;
    if (out.channel === "blog") {
      if (out.blogStyle) fields.blog_style = out.blogStyle;
      if (out.seoMd) fields.seo_md = out.seoMd;
    }
    if (out.channel === "linkedin" || out.channel === "facebook") {
      if (out.socialStyle) fields.social_style = out.socialStyle;
    }

    const title = out.title?.trim() || campaign.name;

    let targetId: string;
    let targetBroadcastId: string | null;
    const existing = existingByChannel.get(out.channel);
    if (existing) {
      await companyOs.from("marketing_content").update({ title, ...fields }).eq("id", existing.id);
      targetId = existing.id;
      targetBroadcastId = existing.broadcast_id;
    } else {
      // Blog anchors the window; social and email stagger after it.
      const offset = out.channel === "blog" ? 0 : DERIVATIVES.find((d) => d.channel === out.channel)?.offsetDays ?? 1;
      const { data: created } = await companyOs
        .from("marketing_content")
        .insert({
          title,
          brand_id: campaign.brand_id,
          pillar_id: campaign.pillar_id,
          campaign_id: campaignId,
          channel: out.channel,
          status: "drafted",
          publish_date: addDays(baseDate, offset),
          created_by: admin.email,
          ...fields,
        })
        .select("id")
        .maybeSingle();
      const createdId = (created as { id: string } | null)?.id ?? null;
      if (!createdId) continue;
      targetId = createdId;
      targetBroadcastId = null;
    }

    // Email deliverables also drive a draft broadcast.
    if (out.channel === "email") {
      const subject = out.subject?.trim() || title;
      const preheader = out.preheader?.trim() || null;
      if (targetBroadcastId) {
        await companyOs
          .from("email_campaigns")
          .update({ subject, preheader, body_md: out.bodyMd, updated_at: new Date().toISOString() })
          .eq("id", targetBroadcastId)
          .eq("status", "draft");
      } else {
        await createDraftBroadcastForEntry({
          entryId: targetId,
          name: title,
          subject,
          preheader,
          bodyMd: out.bodyMd,
          brandId: campaign.brand_id,
          publishDate: baseDate,
          createdBy: admin.email,
        });
      }
    }
  }

  await recordAudit({
    table: "marketing_campaigns",
    recordId: campaignId,
    operation: "bulk_update",
    actor: admin.email,
    context: { ai_drafted: result.outputs.map((o) => o.channel) },
  });
  refresh();
  revalidatePath(`/admin/revenue/marketing/campaigns/${campaignId}`);

  return { ok: true, channels: result.outputs.map((o) => o.channel) };
}

// Spawns a draft email campaign from an email-channel entry and links them, so
// the calendar reflects the campaign's real send status from then on. The
// entry's brand and publish date carry through; scheduling stays draft-editable
// on the campaign side.
export async function createBroadcastFromEntry(id: string): Promise<BroadcastResult> {
  const admin = await requireAdmin();

  const { data: entryData, error: entryError } = await companyOs
    .from("marketing_content")
    .select("id, title, channel, brand_id, broadcast_id, publish_date")
    .eq("id", id)
    .maybeSingle();

  if (entryError) return { ok: false, error: entryError.message };
  if (!entryData) return { ok: false, error: "Entry not found." };

  const entry = entryData as {
    id: string;
    title: string;
    channel: string;
    brand_id: string | null;
    broadcast_id: string | null;
    publish_date: string | null;
  };

  if (entry.channel !== "email") {
    return { ok: false, error: "Only email entries can spawn a broadcast." };
  }
  if (entry.broadcast_id) {
    return { ok: false, error: "This entry already has a broadcast." };
  }

  const broadcastId = await createDraftBroadcastForEntry({
    entryId: id,
    name: entry.title,
    subject: entry.title,
    brandId: entry.brand_id,
    publishDate: entry.publish_date,
    createdBy: admin.email,
  });
  if (!broadcastId) return { ok: false, error: "Broadcast was not created." };

  await recordAudit({
    table: "email_campaigns",
    recordId: broadcastId,
    operation: "insert",
    actor: admin.email,
    context: { from_calendar_entry: id, name: entry.title },
  });
  refresh();
  return { ok: true, broadcastId };
}
