import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { systemPrompt } from "@/entities/company-os/modules/campaigns/ai/brand-writer";
import { blogTypeLabel, socialStyleLabel } from "@/entities/company-os/modules/campaigns/style-catalogues";
import { readTextOutput } from "@/kernel/ai/response";

// Regenerates the copy for ONE calendar asset in its brand's voice, symmetric to
// generateEntryImage. Unlike writeForBrand (which drafts the whole channel set),
// this rewrites a single entry's copy_md and reads the entry's own fields as
// context. The brand voice is the fixed system prompt; the editable instruction
// is the user message, so the UI can show and tweak it before generating.

const MODEL = modelFor("entry-copy", "standard");

const CHANNEL_LABEL: Record<string, string> = {
  blog: "blog post",
  email: "marketing email",
  linkedin: "LinkedIn post",
  facebook: "Facebook post",
};

type EntryRow = {
  id: string;
  title: string;
  brand_id: string | null;
  channel: string;
  copy_md: string | null;
  notes: string | null;
  blog_style: string | null;
  social_style: string | null;
  asset_url: string | null;
  posted_url: string | null;
};

async function loadEntry(entryId: string): Promise<{ ok: true; entry: EntryRow } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("marketing_content")
    .select("id, title, brand_id, channel, copy_md, notes, blog_style, social_style, asset_url, posted_url")
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Entry not found." };
  return { ok: true, entry: data as EntryRow };
}

function buildUserMessage(entry: EntryRow): string {
  const channel = CHANNEL_LABEL[entry.channel] ?? entry.channel;
  const style =
    entry.channel === "blog"
      ? blogTypeLabel(entry.blog_style)
      : entry.channel === "linkedin" || entry.channel === "facebook"
        ? socialStyleLabel(entry.social_style)
        : null;
  const source = entry.posted_url || entry.asset_url || null;

  const parts: string[] = [`Write the ${channel} for a piece titled "${entry.title}".`];
  if (style) parts.push(`Preferred style: ${style}.`);
  if (entry.copy_md) parts.push(`Current draft to improve on (keep what works, tighten the rest):\n\n${entry.copy_md}`);
  if (entry.notes) parts.push(`Notes / direction: ${entry.notes}`);
  if (source) parts.push(`Reference URL: ${source}`);
  parts.push(`Return only the ${channel} copy in Markdown, in this brand's voice and channel rules. No preamble. Do not open with a heading that repeats the title; the page renders the title above the body.`);
  return parts.join("\n\n");
}

// The detail page and blog preview render the title themselves, so a body that
// opens by repeating it as a heading shows the title twice. The prompt forbids
// it; this strips it when the model does it anyway.
function stripLeadingTitleHeading(md: string, title: string): string {
  const m = md.match(/^#{1,2}\s+(.+?)\s*\n+/);
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) return md.slice(m[0].length);
  return md;
}

// The editable instruction seed for the regenerate modal.
export async function buildEntryCopyPrompt(
  entryId: string,
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  const r = await loadEntry(entryId);
  if (!r.ok) return r;
  if (!r.entry.brand_id) {
    return { ok: false, error: "Set a brand on this asset first, so the writer knows the voice." };
  }
  return { ok: true, prompt: buildUserMessage(r.entry) };
}

const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body_md"],
  properties: {
    body_md: {
      type: "string",
      description: "The copy in Markdown (headings, bold, lists, links). For email, exclude the unsubscribe footer; it is added automatically.",
    },
  },
} as const;

export async function generateEntryCopy(
  entryId: string,
  opts?: { prompt?: string },
): Promise<{ ok: true; bodyMd: string } | { ok: false; error: string }> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const r = await loadEntry(entryId);
    if (!r.ok) return r;
    const entry = r.entry;
    if (!entry.brand_id) {
      return { ok: false, error: "Set a brand on this asset first, so the writer knows the voice." };
    }
    const profile = await getBrandProfile(entry.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };

    const userMsg = opts?.prompt?.trim() || buildUserMessage(entry);

    const llm = anthropic();
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt(profile),
      output_config: { effort: "medium", format: { type: "json_schema", schema: COPY_SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const out = readTextOutput("entry-copy", MODEL, response, "The model declined to draft this.");
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = JSON.parse(out.text) as { body_md?: string };
    const bodyMd = stripLeadingTitleHeading((parsed.body_md ?? "").trim(), entry.title);
    if (!bodyMd) return { ok: false, error: "The writer produced nothing usable." };

    const { error } = await companyOs.from("marketing_content").update({ copy_md: bodyMd }).eq("id", entryId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, bodyMd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[entry-copy] failed:", msg);
    return { ok: false, error: msg };
  }
}
