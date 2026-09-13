import { generateEntryImage } from "@/entities/campaigns/lib/ai/brand-image";
import type { WriterOutput } from "@/entities/campaigns/lib/ai/brand-writer";
import { storeCampaignOutputs } from "@/entities/campaigns/lib/calendar-drafting";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { siteForBrandSlug } from "@/entities/campaigns/lib/brand-sites";
import { bannedLanguageError, brandNameError, emDashError } from "./checks";
import { approveChannelAssets, listCampaignAssets, loadBlogAsset } from "./data";
import { brandPreamble, callWriterModel } from "./model";
import { activeChannelsFrom, type WriterChannel } from "./profile-rules";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 9: the channel posts, re-derived from the final validated blog rather
// than the draft, each with an image generated from its own brief. Runs before
// publish so the whole campaign is written in one run; the post's URL is
// known from its slug before it is live. Passes when every active channel
// other than the blog has one asset with an image. With auto-publish on the
// assets are approved, so the campaign reads as built.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outputs"],
  properties: {
    outputs: {
      type: "array",
      description: "One entry per active channel other than the blog.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "title", "body_md", "image_brief_md"],
        properties: {
          channel: { type: "string", enum: ["email", "linkedin", "facebook"] },
          title: { type: "string", description: "Short internal label for this deliverable." },
          subject: { type: "string", description: "Email subject line. Email only." },
          preheader: { type: "string", description: "Email preheader. Email only." },
          body_md: { type: "string", description: "The copy in Markdown, per the channel's rules. Email excludes the unsubscribe footer. Link to the live post where the channel rules ask for a link." },
          social_style: { type: "string", description: "LinkedIn/Facebook: a slug from the brand's preferred social styles." },
          image_style: { type: "string", description: "A slug from the brand's preferred image styles." },
          image_brief_md: { type: "string", description: "A real brief for this channel's image: the one concept, the palette from the image style, the framing. Not a copy of the blog's brief." },
        },
      },
    },
  },
} as const;

type Out = {
  channel: "email" | "linkedin" | "facebook"; title: string; subject?: string; preheader?: string; body_md: string;
  social_style?: string; image_style?: string; image_brief_md: string;
};

export const runChannels: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "Channels: the blog asset has no body to derive from." };
  const wanted = activeChannelsFrom(profile).filter((c): c is Exclude<WriterChannel, "blog"> => c !== "blog");
  if (!wanted.length) return { ok: true, summary: "No channels besides the blog are active." };

  const system = `${brandPreamble(profile)}

## Channel guidelines
${profile.channelsMd ?? "(not set)"}

## Preferred styles (choose only from these slugs)
- Image styles: ${profile.preferredImageStyles.join(", ") || "(none set)"}
- Social styles: ${profile.preferredSocialStyles.join(", ") || "(none set)"}

# Task
The blog post below is final; it goes live at the URL given. Write the ${wanted.join(", ")} deliverable(s) from it, each per its channel rules, re-purposing the same core idea without repeating text across channels. Where a channel's rules call for a link, link to the live post. Give each deliverable its own image brief, following the image style, not the blog hero's brief.`;
  const site = siteForBrandSlug(profile.brandSlug);
  const slug = parseSeoMd(blog.seoMd).slug;
  const liveUrl = blog.postedUrl ?? (site && slug ? `${site.domain}/post/${slug}/` : "(not yet live)");
  const user = `# Live post
${liveUrl}

# Title
${blog.title}

# Body
${blog.copyMd}`;

  const r = await callWriterModel<{ outputs: Out[] }>({ step: "channels", system, user, schema: SCHEMA });
  if (!r.ok) return r;

  const outputs: WriterOutput[] = (r.data.outputs ?? [])
    .filter((o) => o.body_md?.trim() && wanted.includes(o.channel))
    .map((o) => ({
      channel: o.channel, title: o.title, subject: o.subject, preheader: o.preheader, bodyMd: o.body_md,
      socialStyle: o.social_style, imageStyle: o.image_style, imageBriefMd: o.image_brief_md,
    }));
  const missing = wanted.filter((c) => !outputs.some((o) => o.channel === c));
  if (missing.length) return { ok: false, error: `Channels: the writer returned no ${missing.join(", ")} deliverable.` };
  for (const o of outputs) {
    const bad = [emDashError(o.bodyMd), bannedLanguageError(o.bodyMd), brandNameError(o.bodyMd)].find(Boolean);
    if (bad) return { ok: false, error: `Channels (${o.channel}): ${bad}` };
    if (!o.imageBriefMd?.trim()) return { ok: false, error: `Channels (${o.channel}): no image brief.` };
  }

  const { failed } = await storeCampaignOutputs({
    campaign: { id: campaign.id, name: campaign.name, brandId: campaign.brandId, pillarId: campaign.pillarId, startsOn: campaign.startsOn },
    outputs,
    actor: WRITER_ACTOR,
  });
  if (failed.length) return { ok: false, error: `Channels: could not save ${failed.join(", ")}.` };

  const assets = await listCampaignAssets(campaign.id);
  if (!assets.ok) return assets;
  for (const c of wanted) {
    const asset = assets.data.find((a) => a.channel === c);
    if (!asset) return { ok: false, error: `Channels: no ${c} asset after saving.` };
    const img = await generateEntryImage(asset.id, { createdBy: WRITER_ACTOR });
    if (!img.ok) return { ok: false, error: `Channels (${c}) image: ${img.error}` };
  }
  const after = await listCampaignAssets(campaign.id);
  if (!after.ok) return after;
  const short = wanted.filter((c) => !after.data.some((a) => a.channel === c && a.imageUrl));
  if (short.length) return { ok: false, error: `Channels: ${short.join(", ")} still have no image.` };
  if (profile.autoPublish) {
    const approved = await approveChannelAssets(campaign.id);
    if (!approved.ok) return { ok: false, error: `Channels: ${approved.error}` };
    return { ok: true, summary: `${wanted.join(", ")} written from the final post, each with an image, and approved.` };
  }
  return { ok: true, summary: `${wanted.join(", ")} drafted from the final post, each with an image.` };
};
