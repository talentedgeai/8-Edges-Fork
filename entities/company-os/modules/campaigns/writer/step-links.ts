import { getAllPublishedPosts } from "@/entities/site";
import { parseSeoMd } from "@/entities/company-os/modules/campaigns/seo";
import { auditLinkError, internalPostLinks, isInternalUrl, readerText } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { linkPhrase } from "./markup";
import { brandPreamble, callWriterModel } from "./model";
import type { StepRunner } from "./types";

// Step 6: internal links to related published posts and source links at first
// mention, wrapped around phrases already in the body. The model picks; the
// server does the wrapping, so the anchor text is always the author's words.
// Passes when the internal-link floor is met and the reader text is unchanged.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["internal", "sources"],
  properties: {
    internal: {
      type: "array",
      description: "Two to four related published posts to link to.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "slug"],
        properties: {
          phrase: { type: "string", description: "A phrase copied exactly from a body paragraph (not a heading or quote), three to eight words, that reads as descriptive anchor text for the target post." },
          slug: { type: "string", description: "The slug of a related published post from the list given." },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "url"],
        properties: {
          phrase: { type: "string", description: "The exact phrase in the body where the source is first mentioned." },
          url: { type: "string", description: "The source URL, copied exactly from the idea." },
        },
      },
      description: "One link per source the idea supplies, at its first mention in the body. Empty if the idea names no URLs.",
    },
  },
} as const;

type LinksOut = { internal: { phrase: string; slug: string }[]; sources: { phrase: string; url: string }[] };

export const runLinks: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to link." };
  const selfSlug = parseSeoMd(blog.seoMd).slug;

  const posts = (await getAllPublishedPosts()).filter((p) => p.slug !== selfSlug).slice(0, 40);
  if (posts.length < 2) return { ok: false, error: "Links: fewer than two published posts to link to." };
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const sourceUrls = Array.from(new Set(Array.from((campaign.idea ?? "").matchAll(/https?:\/\/[^\s)>\]"']+/g)).map((m) => m[0].replace(/[.,;:]+$/, ""))));

  const system = `${brandPreamble(profile)}

# Task
Choose two to four published posts that genuinely relate to this post and, for each, a phrase already in a body paragraph to link from. Then, for each source URL the idea supplies, name the phrase where the body first mentions that source. Copy phrases exactly; never propose new wording.`;
  const user = `# Post body
${blog.copyMd}

# Published posts (slug: title. excerpt)
${posts.map((p) => `${p.slug}: ${p.title}. ${p.excerpt}`).join("\n")}

# Source URLs in the idea
${sourceUrls.length ? sourceUrls.join("\n") : "(none)"}`;

  const r = await callWriterModel<LinksOut>({ step: "links", system, user, schema: SCHEMA });
  if (!r.ok) return r;

  let md = blog.copyMd;
  const log: string[] = [];
  for (const l of r.data.internal ?? []) {
    if (!bySlug.has(l.slug)) continue;
    const next = linkPhrase(md, l.phrase.trim(), `/post/${l.slug}/`);
    if (!next) continue;
    md = next;
    log.push(`"${l.phrase.trim()}" -> /post/${l.slug}/`);
  }
  const internal = internalPostLinks(md);
  if (internal.length < 2) {
    return { ok: false, error: `Links: only ${internal.length} internal link(s) could be placed on phrases in the body; two are required.` };
  }
  for (const s of r.data.sources ?? []) {
    const url = s.url.trim();
    if (!sourceUrls.includes(url)) continue;
    const next = linkPhrase(md, s.phrase.trim(), url, { external: !isInternalUrl(url) });
    if (!next) continue;
    md = next;
    log.push(`"${s.phrase.trim()}" -> ${url}`);
  }
  const audit = auditLinkError(md);
  if (audit) return { ok: false, error: `Links: ${audit}` };
  if (readerText(md) !== readerText(blog.copyMd)) return { ok: false, error: "Links: the anchor text changed the reader's text." };

  const saved = await updateBlogAsset(blog.id, { copy_md: md });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Links", log);
  if (!noted.ok) return noted;
  return { ok: true, summary: `${internal.length} internal link(s), ${log.length - internal.length} source link(s).` };
};
