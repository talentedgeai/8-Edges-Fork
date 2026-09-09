import { uploadExhibit } from "@/entities/company-os/modules/campaigns/exhibits";
import { countBlocks, exhibitNumbersError } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { figureBlock, headingLines, insertAfterHeading } from "./markup";
import { brandPreamble, callWriterModel } from "./model";
import type { StepRunner } from "./types";

// Step 4: the model proposes two or three exhibits as SVG built from facts
// already in the body, in the brand palette; the server renders each to PNG,
// uploads it, and places a post-figure block under the heading the model
// named. Passes when at least two figures rendered and every number an exhibit
// shows is stated in the body.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exhibits"],
  properties: {
    exhibits: {
      type: "array",
      description: "Two or three exhibits.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["svg", "alt", "caption", "source", "anchor_heading"],
        properties: {
          svg: {
            type: "string",
            description:
              "A complete, self-contained SVG document with viewBox=\"0 0 1600 900\", font-family Manrope, brand palette only, no <image>, <script>, <style> imports or external references. Text only for labels, values and units.",
          },
          alt: { type: "string", description: "Alt text describing what the figure shows, one sentence." },
          caption: { type: "string", description: "The figcaption sentence: what the reader should see in the figure." },
          source: { type: "string", description: "Where the numbers come from, as named in the body or the idea (e.g. 'Every, Fable 5.1 review')." },
          anchor_heading: { type: "string", description: "The exact text of an existing ## or ### heading in the body; the figure goes right under it." },
        },
      },
    },
  },
} as const;

type ExhibitOut = { svg: string; alt: string; caption: string; source: string; anchor_heading: string };

const FIGURE_BLOCK = /<figure class="post-figure">[\s\S]*?<\/figure>\n?/g;

function svgProblem(svg: string): string | null {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s)) return "is not an SVG document";
  if (/<script|<image|<foreignObject|href="https?:|url\(/i.test(s)) return "references external content";
  return null;
}

export const runExhibits: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to illustrate." };

  // A retry re-renders from scratch rather than stacking figures.
  const base = blog.copyMd.replace(FIGURE_BLOCK, "").replace(/\n{3,}/g, "\n\n");
  const headings = headingLines(base);
  if (!headings.length) return { ok: false, error: "Exhibits: the body has no ## headings to place figures under." };

  const system = `${brandPreamble(profile)}

## Image style
${profile.imageStyleMd ?? "(not set)"}

# Task
Propose two or three exhibits for the post: charts, comparisons or timelines that make a point the body already makes with numbers or named items. Every number, name and label in an exhibit must appear in the body verbatim; an exhibit illustrates, it never introduces a fact. Write each as a complete SVG (viewBox 0 0 1600 900, Manrope, the brand palette above, generous margins, labels at 32px or larger so they read at 700px wide). Name the exact heading each figure sits under.`;

  const user = `# Post body
${base}

# Headings you may anchor to (exact text)
${headings.join("\n")}`;

  const r = await callWriterModel<{ exhibits: ExhibitOut[] }>({ step: "exhibits", system, user, schema: SCHEMA });
  if (!r.ok) return r;

  let md = base;
  const placed: string[] = [];
  for (const [i, ex] of (r.data.exhibits ?? []).entries()) {
    const label = `Exhibit ${i + 1}`;
    const bad = svgProblem(ex.svg ?? "");
    if (bad) return { ok: false, error: `Exhibits: ${label} ${bad}.` };
    const numbers = exhibitNumbersError(ex.svg, base, label);
    if (numbers) return { ok: false, error: `Exhibits: ${numbers}` };
    const up = await uploadExhibit(blog.id, ex.svg);
    if (!up.ok) return { ok: false, error: `Exhibits: ${label}: ${up.error}` };
    const block = figureBlock({ index: i + 1, url: up.url, alt: ex.alt, caption: ex.caption, source: ex.source });
    const next = insertAfterHeading(md, ex.anchor_heading, block);
    if (!next) return { ok: false, error: `Exhibits: ${label} names a heading that is not in the body ("${ex.anchor_heading}").` };
    md = next;
    placed.push(`${label}: ${ex.caption} (under "${ex.anchor_heading}")`);
  }
  if (countBlocks(md, "post-figure") < 2) return { ok: false, error: "Exhibits: fewer than two figures were placed." };

  const saved = await updateBlogAsset(blog.id, { copy_md: md });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Exhibits", placed);
  if (!noted.ok) return noted;
  return { ok: true, summary: `${placed.length} exhibits rendered and placed.` };
};
