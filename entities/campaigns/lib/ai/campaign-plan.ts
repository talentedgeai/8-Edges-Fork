import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { listCampaignLedger } from "@/entities/campaigns/lib/campaign-ledger";
import { ledgerLines } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { planErrors, planMdFrom, withPlanSection, type CampaignPlan } from "@/entities/campaigns/lib/campaign-plan-shared";
import { activeChannelsFrom } from "@/entities/campaigns/lib/writer/profile-rules";
import { brandPreamble, callWriterModel } from "@/entities/campaigns/lib/writer/model";

// Plans a campaign from its idea before the writer drafts: the primary
// question, the keyword inside it, the blog type, the hero image style and a
// style per social channel, chosen from the content and against what the
// brand's recent posts already used. The plan is checked (planErrors) and
// saved as the "## Plan" section of the campaign's SEO/GEO plan; the writer
// then follows it instead of choosing again. Never throws.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "keyword", "angle", "blog_type", "hero_image_style", "social"],
  properties: {
    question: {
      type: "string",
      description: "The one question a founder or manager would type into ChatGPT or Google about their own problem, in their own words, that this campaign answers best with a figure from the idea. Starts with How or What. Never names the brand, never asks what a report or post says.",
    },
    keyword: { type: "string", description: "The phrase a person would search, taken from inside the question exactly as written there. Not a sentence." },
    angle: { type: "string", description: "One plain sentence: what this campaign argues and for whom." },
    blog_type: { type: "string", description: "A slug from the brand's preferred blog types that fits the shape of the idea." },
    hero_image_style: { type: "string", description: "A slug from the brand's preferred image styles for the blog hero." },
    social: {
      type: "array",
      description: "One entry per active social channel.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "style"],
        properties: {
          channel: { type: "string", enum: ["linkedin", "facebook", "twitter"] },
          style: { type: "string", description: "A slug from the brand's preferred social styles that fits this channel and this idea." },
        },
      },
    },
  },
} as const;

type PlanOut = { question: string; keyword: string; angle: string; blog_type: string; hero_image_style: string; social: { channel: string; style: string }[] };

export async function planCampaign(campaignId: string): Promise<{ ok: true; plan: CampaignPlan; seoGeoMd: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await companyOs.from("marketing_campaigns").select("id, name, idea, objective, brand_id, seo_geo_md")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Campaign not found." };
    if (!data.brand_id) return { ok: false, error: "Set a brand on this campaign first, so the plan uses the brand's styles." };
    if (!data.idea?.trim()) return { ok: false, error: "Write the campaign idea first; the plan is drawn from it." };

    const profile = await getBrandProfile(data.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };
    const { rows, error: ledgerError } = await listCampaignLedger({ brandId: data.brand_id });
    if (ledgerError) return { ok: false, error: ledgerError };
    const recent = rows.filter((r) => r.campaignId !== campaignId);
    const socialChannels = activeChannelsFrom(profile).filter((c) => c === "linkedin" || c === "facebook" || c === "twitter");

    const system = `${brandPreamble(profile)}

# Task
Plan this campaign from its idea before anything is written. Start from the reader: the primary question is what a founder or manager would actually type into an AI assistant about their own problem ("How do I run better one-on-one meetings with AI?", never "How does AI meeting prep work at ${profile.brandName}?"), and the idea must answer it with a figure. Take the keyword from inside that question. Then choose the blog type, the hero image style and a style for each of these social channels: ${socialChannels.join(", ") || "(none)"}. Choose each from the shape of the content, not by turn, and only from the brand's preferred slugs; a style the recent posts leaned on is the wrong choice unless the idea demands it, and a keyword a recent post owns is never right.

## Preferred styles (choose only from these slugs)
- Blog types: ${profile.preferredBlogTypes.join(", ") || "(any)"}
- Image styles: ${profile.preferredImageStyles.join(", ") || "(any)"}
- Social styles: ${profile.preferredSocialStyles.join(", ") || "(any)"}

## Recent posts (newest first)
${ledgerLines(recent.slice(0, 12))}`;
    const user = `# Campaign
Name: ${data.name}
${data.objective ? `Goal: ${data.objective}\n` : ""}
# Idea
${data.idea}`;

    const r = await callWriterModel<PlanOut>({ step: "plan", system, user, schema: SCHEMA });
    if (!r.ok) return r;
    const plan: CampaignPlan = {
      angle: r.data.angle ?? "",
      question: r.data.question ?? "",
      keyword: r.data.keyword ?? "",
      blogType: r.data.blog_type ?? "",
      heroImageStyle: r.data.hero_image_style ?? "",
      social: Object.fromEntries((r.data.social ?? []).map((s) => [s.channel, s.style])),
    };
    const errors = planErrors(plan, {
      brandName: profile.brandName,
      recent,
      blogTypes: profile.preferredBlogTypes,
      imageStyles: profile.preferredImageStyles,
      socialStyles: profile.preferredSocialStyles,
      socialChannels,
    });
    if (errors.length) return { ok: false, error: `Plan: ${errors.join(" ")}` };

    const seoGeoMd = withPlanSection(data.seo_geo_md, planMdFrom(plan));
    const { error: upErr } = await companyOs.from("marketing_campaigns").update({ seo_geo_md: seoGeoMd }).eq("id", campaignId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, plan, seoGeoMd };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
