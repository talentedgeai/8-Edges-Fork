import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import mammoth from "mammoth";
import { supabase, companyOs } from "@/lib/supabase";
import { FAMILY_BY_KEY, type FamilyScreen, type RoleFamilyKey } from "@/lib/role-families";
import { readTextOutput } from "@/lib/ai/response";

// Family AI screen: rates one application's resume against a role-family
// ideal profile (lib/role-families.ts) instead of a specific req's JD, so
// candidates across several reqs share one comparable 0-5 score. The result
// is stored at applications.metadata.family_screen — the per-req screen on
// the ai_* columns is never touched. Never throws.

const MODEL = modelFor("family-screen", "standard");

const FAMILY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "strengths", "gaps", "rating"],
  properties: {
    overview: {
      type: "string",
      description:
        "One tight paragraph: who the candidate is, years of experience, and their most relevant concrete accomplishments for this role family.",
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "3-5 bullets tying the candidate's real experience to the ideal profile's key criteria.",
    },
    gaps: {
      type: "array",
      items: { type: "string" },
      description: "1-3 bullets on the biggest gaps versus the ideal profile. Empty only for a truly exceptional match.",
    },
    rating: {
      type: "number",
      description:
        "Fit against the role-family ideal profile, 0.0 to 5.0 with one decimal. 5 = exceptional on every criterion; 3 = solid with real gaps; 1 = poor fit. Use the full scale — this stack-ranks the whole talent pool.",
    },
  },
} as const;

const FAMILY_SYSTEM = `You are the recruiting screener for Edge8, an AI consulting and staffing company in Vietnam. You rate one candidate's resume against an ideal profile for a role family (not a specific job opening). The score stack-ranks every candidate Edge8 has ever seen for this kind of role, so consistency and differentiation matter more than generosity.

Ground every claim in the resume. Distinguish candidates who have genuinely built or owned things from those who list buzzwords. Be direct about gaps — use the full 0-5 scale rather than clustering around 4.`;

type Ok = { ok: true; rating: number };
type Err = { ok: false; error: string };

async function resumeContentBlock(
  storagePath: string,
  mimeType: string | null,
): Promise<{ ok: true; block: Anthropic.ContentBlockParam } | Err> {
  const { data, error } = await supabase.storage.from("resumes").download(storagePath);
  if (error || !data) return { ok: false, error: `Could not download resume: ${error?.message ?? "no data"}` };
  const buffer = Buffer.from(await data.arrayBuffer());

  const lower = storagePath.toLowerCase();
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx");

  if (isPdf) {
    return {
      ok: true,
      block: {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      },
    };
  }
  if (isDocx) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) return { ok: false, error: "Resume .docx contained no extractable text." };
    return { ok: true, block: { type: "text", text: `RESUME (extracted from .docx):\n\n${text}` } };
  }
  return { ok: false, error: "Unsupported resume format (only PDF and .docx)." };
}

export async function screenApplicationForFamily(
  applicationId: string,
  familyKey: RoleFamilyKey,
): Promise<Ok | Err> {
  try {
    return await runFamilyScreen(applicationId, familyKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[family-screen] ${applicationId} failed:`, msg);
    return { ok: false, error: msg };
  }
}

async function runFamilyScreen(applicationId: string, familyKey: RoleFamilyKey): Promise<Ok | Err> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const family = FAMILY_BY_KEY[familyKey];
  if (!family) return { ok: false, error: `Unknown role family: ${familyKey}` };

  const { data: app, error: appErr } = await companyOs
    .from("applications")
    .select("id, metadata, resume_document_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Application not found." };
  if (!app.resume_document_id) return { ok: false, error: "No resume on file." };

  const { data: doc, error: docErr } = await companyOs
    .from("documents")
    .select("storage_path, mime_type")
    .eq("id", app.resume_document_id)
    .maybeSingle();
  if (docErr || !doc) return { ok: false, error: docErr?.message ?? "Resume document not found." };

  const resume = await resumeContentBlock(doc.storage_path, doc.mime_type);
  if (!resume.ok) return { ok: false, error: resume.error };

  const llm = anthropic();
  const response = await llm.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: FAMILY_SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: FAMILY_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          resume.block,
          {
            type: "text",
            text: `# Role family: ${family.label}\n\n## Ideal profile\n${family.profile}\n\nRate this resume against the ideal profile.`,
          },
        ],
      },
    ],
  });

  const out = readTextOutput(
    "family-screen",
    MODEL,
    response,
    "The model declined to screen this document.",
  );
  if (!out.ok) return { ok: false, error: out.error };

  const parsed = JSON.parse(out.text) as {
    overview: string;
    strengths: string[];
    gaps: string[];
    rating: number;
  };
  const screen: FamilyScreen = {
    family: familyKey,
    rating: Math.min(5, Math.max(0, Math.round(parsed.rating * 10) / 10)),
    overview: parsed.overview,
    strengths: parsed.strengths,
    gaps: parsed.gaps,
    screened_at: new Date().toISOString(),
    model: MODEL,
  };

  const metadata = { ...((app.metadata as Record<string, unknown>) ?? {}), family_screen: screen };
  const { error: upErr } = await companyOs.from("applications").update({ metadata }).eq("id", applicationId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, rating: screen.rating };
}
