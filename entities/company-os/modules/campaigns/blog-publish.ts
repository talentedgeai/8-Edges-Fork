import { revalidateTag, revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { categories } from "@/entities/site";
import { parseSeoMd, isValidSlug, type ParsedSeo } from "@/entities/company-os/modules/campaigns/seo";
import { BLOG_CACHE_TAG, postTag } from "@/entities/site";
import { siteForBrandSlug, blogPublishBlocker } from "@/entities/company-os/modules/campaigns/brand-sites";

// The deterministic publish core, runtime-agnostic so both the admin server
// action and the Publish Editor agent's publish tool call the same logic. It
// validates, normalizes the loose seo_md into columns, flips status, revalidates
// every surface, and verifies the live URL. Brand-aware: the destination domain
// comes from the asset's brand, never a hardcoded site. Never throws for a
// validation problem — it returns the full failure list for the caller to act on.

const MIN_WORDS = 600;

export type PublishResult =
  | { ok: true; slug: string; liveUrl: string; verified: boolean; warning?: string }
  | { ok: false; errors: string[] };

type BlogRow = {
  id: string;
  channel: string;
  title: string;
  status: string;
  copy_md: string | null;
  seo_md: string | null;
  image_url: string | null;
  publish_date: string | null;
  posted_url: string | null;
  brand_id: string | null;
  brands: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

const SELECT =
  "id, channel, title, status, copy_md, seo_md, image_url, publish_date, posted_url, brand_id, brands(name, slug)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function bodyWordCount(copyMd: string): number {
  const body = copyMd.split("## FAQ")[0];
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*`>_[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function resolveCategory(parsedCategory: string | null): { category: string; categorySlug: string } {
  const wanted = (parsedCategory ?? "").trim().toLowerCase();
  const hit = categories.find((c) => c.slug === wanted || c.label.toLowerCase() === wanted);
  return hit ? { category: hit.label, categorySlug: hit.slug } : { category: "Innovation", categorySlug: "innovation" };
}

// Pure validation, shared by the publish action and the agent's read-only
// run_validation_checks tool. Reports every failure at once.
export function validateBlogForPublish(
  row: Pick<BlogRow, "channel" | "copy_md" | "seo_md" | "image_url">,
  parsed: ParsedSeo,
  slugTaken: (slug: string) => boolean,
): string[] {
  const errors: string[] = [];
  if (row.channel !== "blog") errors.push("Only blog assets can be published to the site.");
  if (!row.copy_md?.trim()) errors.push("The post has no body copy.");
  if (!row.image_url) errors.push("The post has no hero image. Generate or select one first.");
  if (!row.seo_md?.trim()) errors.push("The post has no SEO plan (seo_md).");

  if (!parsed.slug) errors.push("No slug found in the SEO plan.");
  else if (!isValidSlug(parsed.slug)) errors.push(`Slug "${parsed.slug}" is not a valid kebab-case slug.`);
  else if (slugTaken(parsed.slug)) errors.push(`Slug "${parsed.slug}" is already in use by another post.`);
  if (!parsed.titleTag) errors.push("No title tag found in the SEO plan.");
  if (!parsed.metaDescription) errors.push("No meta description found in the SEO plan.");

  const copy = row.copy_md ?? "";
  if (copy && bodyWordCount(copy) < MIN_WORDS) errors.push(`Body is under ${MIN_WORDS} words.`);
  if (copy && !/<details[^>]*class="faq-item"/i.test(copy)) errors.push("The post has no FAQ (required for FAQ structured data).");

  // Brand rule: never em dashes.
  const emDashScope = [copy, parsed.titleTag ?? "", parsed.metaDescription ?? ""].join("\n");
  if (emDashScope.includes("—")) errors.push("Contains an em dash (—). Edge8 never uses em dashes.");

  // SEO floor: every post links into the rest of the blog (in the body, not the
  // FAQ), and the title tag must be crafted, not "{title} | Edge8 Blog" filler.
  // Both defects shipped at scale once (the static migration bypassed this
  // gate); the gate keeps them out of anything published from here on.
  const bodyOnly = copy.split("## FAQ")[0];
  const internalLinks = (bodyOnly.match(/\]\(\/post\//g) ?? []).length;
  if (copy && internalLinks < 2) {
    errors.push(`Only ${internalLinks} internal link(s) in the body. Add at least 2 links to related posts (/post/<slug>/).`);
  }
  if (parsed.titleTag && /\|\s*Edge8 Blog\s*$/i.test(parsed.titleTag)) {
    errors.push('Title tag is the generic "... | Edge8 Blog" pattern. Write a keyword-led title tag.');
  }

  return errors;
}

// True if the slug belongs to a legacy static post or a *different* published
// DB blog row.
async function isSlugTaken(slug: string, selfId: string): Promise<boolean> {
  const { data } = await companyOs
    .from("marketing_content")
    .select("id")
    .eq("channel", "blog")
    .eq("slug", slug)
    .neq("id", selfId)
    .maybeSingle();
  return Boolean(data);
}

// Revalidate every surface that lists or renders a blog post. Called on publish
// AND on unpublish so the site reflects the change within one request.
export function revalidateBlog(slug: string): void {
  revalidateTag(BLOG_CACHE_TAG);
  revalidateTag(postTag(slug));
  revalidatePath(`/post/${slug}/`);
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}

async function verifyLive(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", redirect: "follow" });
      if (res.ok) return true;
    } catch {
      // transient; retry
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return false;
}

export async function publishBlogAsset(id: string, actor: string): Promise<PublishResult> {
  const { data, error } = await companyOs.from("marketing_content").select(SELECT).eq("id", id).maybeSingle();
  if (error) return { ok: false, errors: [error.message] };
  if (!data) return { ok: false, errors: ["Asset not found."] };
  const row = data as BlogRow;

  // Resolve the destination site from the brand. A brand with no live blog
  // (AIO until its site ships one, or any unconfigured brand) is refused here
  // rather than sending content to the wrong domain or a dead URL.
  const brand = one(row.brands);
  const site = siteForBrandSlug(brand?.slug ?? null);
  const brandBlock = blogPublishBlocker(brand?.slug ?? null, brand?.name ?? "This brand");
  if (brandBlock || !site) {
    return { ok: false, errors: [brandBlock ?? "This brand has no website configured for blog publishing."] };
  }

  const parsed = parseSeoMd(row.seo_md);
  const slugTaken = new Set<string>();
  if (parsed.slug && (await isSlugTaken(parsed.slug, id))) slugTaken.add(parsed.slug);

  const errors = validateBlogForPublish(row, parsed, (s) => slugTaken.has(s));
  if (errors.length) return { ok: false, errors };

  const slug = parsed.slug as string;
  const words = bodyWordCount(row.copy_md ?? "");
  const readTime = `${Math.max(1, Math.round(words / 200))} min read`;
  const { category, categorySlug } = resolveCategory(parsed.category);
  const publishDate = row.publish_date ?? new Date().toISOString().slice(0, 10);

  const { error: upErr } = await companyOs
    .from("marketing_content")
    .update({
      status: "published",
      slug,
      title_tag: parsed.titleTag,
      meta_description: parsed.metaDescription,
      excerpt: parsed.excerpt ?? parsed.metaDescription,
      primary_keyword: parsed.primaryKeyword,
      category,
      category_slug: categorySlug,
      read_time: readTime,
      publish_date: publishDate,
      published_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) return { ok: false, errors: [upErr.message] };

  const liveUrl = `${site.domain}/post/${slug}/`;

  // Only this site's own cache can be revalidated from here. A different brand's
  // site (a future AIO blog) revalidates itself; we still verify its live URL.
  if (site.self) revalidateBlog(slug);

  const verified = await verifyLive(liveUrl);
  if (verified) {
    await companyOs.from("marketing_content").update({ posted_url: liveUrl }).eq("id", id);
  }

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor,
    context: { published: true, slug, brand: brand?.slug, verified },
  });
  return verified
    ? { ok: true, slug, liveUrl, verified: true }
    : { ok: true, slug, liveUrl, verified: false, warning: "Published, but the live URL did not return 200 yet. It may take a minute to propagate; re-verify shortly." };
}
