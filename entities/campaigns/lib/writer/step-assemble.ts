import { renderPostMarkdown } from "@/entities/site";
import { countBlocks } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { faqBlock, ideaInBriefBlock, insertAfterHeading, insertBeforeFirstH2, parseFaqSection, pullQuoteBlock, stripFaq } from "./markup";
import { brandPreamble, callWriterModel } from "./model";
import type { StepRunner } from "./types";

// Step 7: the house format. An Idea in Brief box after the opening, pull
// quotes taken verbatim from the idea's sources, and the FAQ block at the end.
// Passes when the assembled body renders through the real sanitizer with every
// block intact: one idea-in-brief, five faq-item, at least one blockquote, and
// the figures the exhibits step placed.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["idea_in_brief", "pull_quotes"],
  properties: {
    idea_in_brief: {
      type: "object",
      additionalProperties: false,
      required: ["problem", "insight", "way_forward"],
      properties: {
        problem: { type: "string", description: "One or two sentences: the problem the reader has." },
        insight: { type: "string", description: "One or two sentences: the post's central insight." },
        way_forward: { type: "string", description: "One or two sentences: what the reader does next." },
      },
    },
    pull_quotes: {
      type: "array",
      description: "One to three pull quotes.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "anchor_heading"],
        properties: {
          quote: { type: "string", description: "A sentence or two copied verbatim from the source material in the idea. Never paraphrased, never from the post body." },
          anchor_heading: { type: "string", description: "The exact text of the ## or ### heading the quote sits under." },
        },
      },
    },
  },
} as const;

type AssembleOut = {
  idea_in_brief: { problem: string; insight: string; way_forward: string };
  pull_quotes: { quote: string; anchor_heading: string }[];
};

const BRIEF_BLOCK = /<div class="idea-in-brief">[\s\S]*?<\/div>\n<\/div>\n?/;

function normalize(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

export const runAssemble: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to assemble." };
  const faq = parseFaqSection(blog.seoMd);
  if (faq.length !== 5) return { ok: false, error: `Assemble: the SEO package carries ${faq.length} FAQ item(s), not 5. Re-run the SEO step.` };

  // Idempotent on retry: rebuild the brief, the quotes and the FAQ from scratch.
  const base = stripFaq(blog.copyMd.replace(BRIEF_BLOCK, "")).replace(/^>\s.*\n?/gm, "").replace(/\n{3,}/g, "\n\n");
  const idea = campaign.idea ?? "";

  const system = `${brandPreamble(profile)}

# Task
Two things for the post you are given. First, the Idea in Brief: the problem, the insight and the way forward, each one or two plain sentences in the brand voice, no Markdown. Second, one to three pull quotes: sentences copied verbatim from the source material in the idea (a named person, publication or document), each placed under the heading where the post discusses it. A quote is verbatim or it is wrong; do not paraphrase and do not quote the post itself.`;
  const user = `# Post body
${base}

# Source material (quote only from here)
${idea || "(none)"}`;

  const r = await callWriterModel<AssembleOut>({ step: "assemble", system, user, schema: SCHEMA });
  if (!r.ok) return r;

  const ideaNorm = normalize(idea);
  let md = base;
  const placed: string[] = [];
  for (const q of r.data.pull_quotes ?? []) {
    const quote = q.quote.trim();
    if (!quote || !ideaNorm.includes(normalize(quote))) continue;
    const next = insertAfterHeading(md, q.anchor_heading, pullQuoteBlock(quote));
    if (!next) continue;
    md = next;
    placed.push(`"${quote.slice(0, 80)}${quote.length > 80 ? "..." : ""}" under "${q.anchor_heading}"`);
  }
  if (!placed.length) return { ok: false, error: "Assemble: no pull quote could be verified verbatim against the idea's sources and placed under an existing heading." };

  const brief = r.data.idea_in_brief;
  md = insertBeforeFirstH2(md, ideaInBriefBlock({ problem: brief.problem, insight: brief.insight, wayForward: brief.way_forward }));
  md = `${md.trimEnd()}\n\n${faqBlock(faq)}\n`;

  const figures = countBlocks(base, "post-figure");
  const html = await renderPostMarkdown(md);
  const kept = {
    brief: (html.match(/class="idea-in-brief"/g) ?? []).length,
    faq: (html.match(/class="faq-item"/g) ?? []).length,
    quotes: (html.match(/<blockquote>/g) ?? []).length,
    figures: (html.match(/class="post-figure"/g) ?? []).length,
  };
  const problems: string[] = [];
  if (kept.brief !== 1) problems.push(`idea-in-brief ${kept.brief}`);
  if (kept.faq !== 5) problems.push(`faq-item ${kept.faq}`);
  if (kept.quotes < 1) problems.push(`blockquote ${kept.quotes}`);
  if (kept.figures !== figures) problems.push(`post-figure ${kept.figures} of ${figures}`);
  if (problems.length) return { ok: false, error: `Assemble: the sanitizer did not keep every block (${problems.join(", ")}).` };

  const saved = await updateBlogAsset(blog.id, { copy_md: md });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Assemble", [`Idea in Brief added`, ...placed.map((p) => `Pull quote ${p}`), `FAQ block with 5 items`]);
  if (!noted.ok) return noted;
  return { ok: true, summary: `Assembled: Idea in Brief, ${placed.length} pull quote(s), 5 FAQ, ${figures} figure(s).` };
};
