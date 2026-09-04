import { anthropic } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import { companyOs } from "@/lib/supabase";
import { getBrandProfile } from "@/lib/admin/brand-profiles";
import { readTextOutput } from "@/lib/ai/response";

// Drafts the search + generative-engine plan for a campaign. Unlike the freeform
// note it replaces, this produces three named sections the writer and the blog
// publisher can rely on: classic SEO, an FAQ (the questions that win featured
// snippets and ship as FAQPage JSON-LD), and GEO (the citable facts, entities,
// and question phrasings that get a page quoted by ChatGPT / Perplexity). Same
// contract as the other writers: never throws, no-ops without a key.

const MODEL = modelFor("campaign-seo", "standard");

type Result = { ok: true; seoGeoMd: string } | { ok: false; error: string };

type CampaignRow = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  brand_id: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["seo_geo_md"],
  properties: {
    seo_geo_md: {
      type: "string",
      description:
        "The full plan in Markdown with exactly these H2 sections in order: '## Search (SEO)', '## FAQ', '## GEO (generative engines)'. Search: primary keyword, 3-5 secondary keywords, title tag (<=60 chars), meta description (<=155 chars), URL slug, and 3-5 internal link targets. FAQ: 4-6 real questions a searcher types, each with a 1-2 sentence answer, written to win featured snippets and People Also Ask. GEO: the citable facts (named entities, 2-3 concrete statistics WITH their source, a one-sentence definition an LLM can quote verbatim) and 3-4 natural-language question phrasings people ask an AI assistant on this topic. Never invent statistics; if none are in the source, say what data to gather instead.",
    },
  },
} as const;

export async function generateCampaignSeoGeo(campaignId: string): Promise<Result> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const { data, error } = await companyOs
      .from("marketing_campaigns")
      .select("id, name, idea, objective, brand_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Campaign not found." };
    const campaign = data as CampaignRow;
    if (!campaign.brand_id) {
      return { ok: false, error: "Set a brand on this campaign first, so the plan matches the brand's SEO lens." };
    }

    const profile = await getBrandProfile(campaign.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };

    // The blog asset's copy is the best source for concrete keywords and facts.
    const { data: blog } = await companyOs
      .from("marketing_content")
      .select("copy_md")
      .eq("campaign_id", campaignId)
      .eq("channel", "blog")
      .not("copy_md", "is", null)
      .limit(1)
      .maybeSingle();
    const blogCopy = (blog as { copy_md: string | null } | null)?.copy_md ?? null;

    const system = `You are the search and generative-engine strategist for ${profile.brandName}. Produce a plan that is specific, honest, and immediately usable by a writer.

## Brand positioning
${profile.positioning ?? "(not set)"}

## Audience
${profile.audience ?? "(not set)"}

## What we sell
${profile.offer ?? "(not set)"}

## SEO lens (follow this)
${profile.seoLensMd ?? "(none set; apply sound SEO fundamentals)"}

Never use em dashes. Do not invent facts, metrics, or quotes. Return through the provided schema only.`;

    const userMsg = `# Campaign
Name: ${campaign.name}
${campaign.objective ? `Goal: ${campaign.objective}\n` : ""}Idea: ${campaign.idea ?? "(no idea text)"}

${blogCopy ? `# Blog copy (source for keywords and facts)\n\n${blogCopy.slice(0, 6000)}` : "# No blog copy yet\n\nWork from the idea; flag where real data should be gathered."}

Write the Search / FAQ / GEO plan for this campaign.`;

    const llm = anthropic();
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const out = readTextOutput("campaign-seo", MODEL, response, "The model declined to draft this.");
    if (!out.ok) return { ok: false, error: out.error };
    const parsed = JSON.parse(out.text) as { seo_geo_md?: string };
    const seoGeoMd = (parsed.seo_geo_md ?? "").trim();
    if (!seoGeoMd) return { ok: false, error: "The strategist produced nothing usable." };

    const { error: upErr } = await companyOs
      .from("marketing_campaigns")
      .update({ seo_geo_md: seoGeoMd })
      .eq("id", campaignId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, seoGeoMd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-seo] failed:", msg);
    return { ok: false, error: msg };
  }
}
