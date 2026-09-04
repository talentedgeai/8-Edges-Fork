import { anthropic } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import { getBrandProfile, type BrandProfile } from "@/lib/admin/brand-profiles";
import { readTextOutput } from "@/lib/ai/response";

// The AI writer. Given a brand and a source (a blog post or a brief), it drafts
// content by following the brand's own content_rules_md. Nothing about the
// output is hardwired here: which deliverables to produce, the lens, and the
// per-channel rules all come from the brand profile the admin edits. Same shape
// as lib/ai/idea-plan.ts: never throws, no-ops without a key.

const MODEL = modelFor("brand-writer", "standard");

export type WriterOutput = {
  channel: "email" | "linkedin" | "facebook" | "blog";
  title?: string;
  subject?: string; // email only
  preheader?: string; // email only
  bodyMd: string;
  blogStyle?: string; // blog only, a slug from the brand's preferred blog types
  socialStyle?: string; // linkedin/facebook only
  imageStyle?: string; // a slug from the brand's preferred image styles
  seoMd?: string; // blog only, the Patel SEO package
  imageBriefMd?: string; // the design brief
};

export type WriterResult =
  | { ok: true; outputs: WriterOutput[] }
  | { ok: false; error: string };

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outputs"],
  properties: {
    outputs: {
      type: "array",
      description:
        "One entry per deliverable the brand's content rules call for. Produce exactly the channels the rules specify, no more.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "body_md"],
        properties: {
          channel: { type: "string", enum: ["email", "linkedin", "facebook", "blog"] },
          title: { type: "string", description: "Short internal label for this deliverable." },
          subject: { type: "string", description: "Email subject line. Email channel only." },
          preheader: { type: "string", description: "Email preheader. Email channel only." },
          body_md: {
            type: "string",
            description:
              "The copy in Markdown (headings, bold, lists, links). For email, exclude the unsubscribe footer; it is added automatically.",
          },
          blog_style: { type: "string", description: "Blog only: a slug from the brand's preferred blog types." },
          social_style: { type: "string", description: "LinkedIn/Facebook only: a slug from the brand's preferred social styles." },
          image_style: { type: "string", description: "A slug from the brand's preferred image styles that fits this piece." },
          seo_md: { type: "string", description: "Blog only: the SEO package (title tag, meta description, slug, primary and secondary keywords, five link ideas) run through the SEO lens." },
          image_brief_md: { type: "string", description: "A short image brief: hero concept, palette, and ratios, following the brand's image style." },
        },
      },
    },
  },
} as const;

export function systemPrompt(profile: BrandProfile): string {
  const s = (v: string | null) => v ?? "(not set)";
  return `You are the content writer for ${profile.brandName}. Write only in this brand's voice and follow its channel rules and writing process exactly. The brand's own rules, not any default, decide which deliverables you produce and how each channel reads.

# Brand: ${profile.brandName}

## Positioning
${s(profile.positioning)}

## Audience
${s(profile.audience)}

## What we sell
${s(profile.offer)}

## Default call to action
${s(profile.primaryCta)}

## Author and credentials
${s(profile.authorMd)}

## Voice
${s(profile.voiceMd)}

## Hard rules (never break these)
${s(profile.rulesMd)}

## Channel guidelines (produce exactly these channels, each per its rules)
${s(profile.channelsMd)}

## Writing process
${s(profile.processMd)}

## Blog styles (choose the one that fits)
${s(profile.blogStylesMd)}

## Editing lens (apply before finalising every piece)
${s(profile.editingLensMd)}

## SEO lens (apply to any blog or headline work)
${s(profile.seoLensMd)}

## Image style (for any visual direction you suggest)
${s(profile.imageStyleMd)}

## Preferred styles (choose only from these slugs)
- Blog types: ${profile.preferredBlogTypes.join(", ") || "(none set)"}
- Image styles: ${profile.preferredImageStyles.join(", ") || "(none set)"}
- Social styles: ${profile.preferredSocialStyles.join(", ") || "(none set)"}

# Output
Produce one output per channel the Channel guidelines mark active for a write request (typically email, LinkedIn, Facebook). Re-purpose the same core idea per channel; never repeat identical text across channels. Run every piece through the editing lens before returning it. Tag each output with an image_style slug from the preferred list; tag social outputs with a social_style slug; if you produce a blog output, tag its blog_style, and include seo_md run through the SEO lens plus an image_brief_md. Never open body_md with a heading that repeats the piece's title; the page renders the title above the body. Never use em dashes. Do not invent facts, metrics, or quotes that are not in the source. Return through the provided schema only.`;
}

export async function writeForBrand(input: {
  brandId: string;
  sourceText: string;
  sourceUrl?: string | null;
  brief?: string | null;
}): Promise<WriterResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
    }

    const profile = await getBrandProfile(input.brandId);
    if (!profile) return { ok: false, error: "Brand not found." };
    if (!profile.channelsMd && !profile.voiceMd) {
      return { ok: false, error: "This brand has no writing profile yet. Fill it in under Marketing > Brands." };
    }

    const userMsg = `# Source material

${input.sourceUrl ? `Source URL: ${input.sourceUrl}\n\n` : ""}${input.brief ? `Brief: ${input.brief}\n\n` : ""}${input.sourceText || "(no source text; work from the brief above)"}

Draft the deliverables the content rules specify, re-purposed to this brand's lens.`;

    const llm = anthropic();
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(profile),
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const out = readTextOutput(
      "brand-writer",
      MODEL,
      response,
      "The model declined to draft this content.",
    );
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = JSON.parse(out.text) as {
      outputs: {
        channel: string; title?: string; subject?: string; preheader?: string; body_md: string;
        blog_style?: string; social_style?: string; image_style?: string; seo_md?: string; image_brief_md?: string;
      }[];
    };
    const outputs: WriterOutput[] = (parsed.outputs ?? [])
      .filter((o) => o.body_md && o.channel)
      .map((o) => ({
        channel: o.channel as WriterOutput["channel"],
        title: o.title,
        subject: o.subject,
        preheader: o.preheader,
        bodyMd: o.body_md,
        blogStyle: o.blog_style,
        socialStyle: o.social_style,
        imageStyle: o.image_style,
        seoMd: o.seo_md,
        imageBriefMd: o.image_brief_md,
      }));

    if (outputs.length === 0) return { ok: false, error: "The writer produced nothing usable." };
    return { ok: true, outputs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-writer] failed:", msg);
    return { ok: false, error: msg };
  }
}

// Fetches a public URL and reduces it to plain text for use as source material.
// Best-effort: returns empty string on any failure so the caller can fall back
// to a brief.
export async function fetchSourceText(url: string, maxChars = 6000): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Edge8-Writer/1.0" } });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}
