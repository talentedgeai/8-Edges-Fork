import { isValidSlug, normalizeSlug, parseSeoMd } from "@/entities/company-os/modules/campaigns/seo";
import { emDashError, faqError } from "./checks";
import { loadBlogAsset, slugTaken, updateBlogAsset } from "./data";
import { faqBlock, seoMdFrom, type FaqItem } from "./markup";
import { brandPreamble, callWriterModel } from "./model";
import type { StepRunner } from "./types";

// Step 3: the SEO and AEO pass with the brand's SEO lens. The model returns the
// package as fields; the server writes seo_md in the one labelled format
// parseSeoMd reads, so no label drift can stop the publish gate again. Passes
// when the labels parse back, the slug is valid and free, and the FAQ leads
// with a How or What question carrying the primary keyword.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "title_tag", "meta_description", "slug", "primary_keyword", "secondary_keywords", "excerpt", "category", "faq"],
  properties: {
    title: { type: "string", description: "The H1 for humans: the brand hook. May differ from the title tag." },
    title_tag: { type: "string", description: "Keyword-led title tag for search, at most 60 characters. Never the generic '{title} | Brand' pattern." },
    meta_description: { type: "string", description: "Leads with the keyword, names the benefit, ends on a hook. At most 155 characters." },
    slug: { type: "string", description: "kebab-case URL slug, at most 80 characters." },
    primary_keyword: { type: "string", description: "A phrase a real person would type into a search engine this month. Not a sentence." },
    secondary_keywords: { type: "array", items: { type: "string" }, description: "Two to four supporting phrases." },
    excerpt: { type: "string", description: "One or two specific sentences for the listing card." },
    category: { type: "string", description: "One of the blog categories given." },
    faq: {
      type: "array",
      description: "Five questions an AI assistant would extract, led by the entities people search for this month (the names in the idea and its sources). The FIRST question starts with How or What and contains the primary keyword verbatim.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string", description: "Two to four sentences, plain prose, self-contained, no Markdown." },
        },
      },
    },
  },
} as const;

type SeoOut = {
  title: string; title_tag: string; meta_description: string; slug: string; primary_keyword: string;
  secondary_keywords: string[]; excerpt: string; category: string; faq: FaqItem[];
};

export const runSeo: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to optimise." };

  const system = `${brandPreamble(profile)}

## SEO lens (apply every point)
${profile.seoLensMd ?? "(the brand has no SEO lens; use keyword realism, intent match, and a title tag split from the H1)"}

# Task
Produce the search and AI-search package for the post you are given. Keyword realism first: would the audience type it? If page one is owned by a major publisher or the term's originator, pick a long-tail alternative this site can win. The title tag is keyword-led; the H1 is the brand hook. The five FAQ questions are the ones an AI assistant would extract about this post, led by the entities people search for this month: the model names, companies and sources named in the idea. The first question must start with How or What and contain the primary keyword exactly as written. Categories available: Revenue, Talent, Operations, Innovation.`;

  const user = `# Post title (current H1)
${blog.title}

# Post body
${blog.copyMd}

# Idea and sources
${campaign.idea ?? "(none)"}

# Current SEO notes (may be incomplete or wrongly labelled; supersede them)
${blog.seoMd ?? "(none)"}`;

  const r = await callWriterModel<SeoOut>({ step: "seo", system, user, schema: SCHEMA });
  if (!r.ok) return r;
  const out = r.data;

  const failures: string[] = [];
  const slug = normalizeSlug(out.slug);
  if (!slug || !isValidSlug(slug)) failures.push(`Slug "${out.slug}" is not a valid kebab-case slug.`);
  else if (await slugTaken(slug, blog.id)) failures.push(`Slug "${slug}" is already in use by another post.`);
  if (!out.title_tag?.trim()) failures.push("No title tag.");
  if (!out.meta_description?.trim()) failures.push("No meta description.");
  if (/\|\s*Edge8 Blog\s*$/i.test(out.title_tag ?? "")) failures.push("Title tag is the generic '... | Edge8 Blog' pattern.");
  for (const e of [emDashError([out.title, out.title_tag, out.meta_description, out.excerpt].join("\n"))]) if (e) failures.push(e);
  const faq = (out.faq ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
  const faqProblem = faqError(faqBlock(faq), out.primary_keyword ?? null);
  if (faqProblem) failures.push(faqProblem);
  if (failures.length) return { ok: false, error: `SEO: ${failures.join(" ")}` };

  const seoMd = seoMdFrom({
    titleTag: out.title_tag,
    metaDescription: out.meta_description,
    slug: slug!,
    primaryKeyword: out.primary_keyword,
    secondaryKeywords: out.secondary_keywords ?? [],
    excerpt: out.excerpt,
    category: out.category,
    faq,
  });
  // The step is only done when the file it wrote reads back.
  const parsed = parseSeoMd(seoMd);
  if (!parsed.titleTag || !parsed.metaDescription || parsed.slug !== slug) {
    return { ok: false, error: "SEO: the package did not parse back through parseSeoMd." };
  }

  const fields: { seo_md: string; title?: string } = { seo_md: seoMd };
  if (out.title?.trim()) fields.title = out.title.trim();
  const saved = await updateBlogAsset(blog.id, fields);
  if (!saved.ok) return saved;
  return { ok: true, summary: `SEO package written: slug ${slug}, keyword "${out.primary_keyword}", 5 FAQ.` };
};
