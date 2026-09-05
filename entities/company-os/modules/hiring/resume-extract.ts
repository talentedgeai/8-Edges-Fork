import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { resumeContentBlock } from "@/entities/company-os/modules/hiring/resume-screen";
import { readTextOutput } from "@/kernel/ai/response";

// Resume field extraction for the recruiter add-candidates intake: reads an
// already-uploaded resume from the `resumes` bucket and asks Claude for the
// contact/profile fields, which prefill an editable draft — the recruiter
// always reviews before anything is saved. Distinct from the resume *screen*
// (fit rating), which runs later against a job requisition.

const MODEL = modelFor("resume-extract", "fast");

export type ExtractedCandidate = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  headline: string | null;
  current_title: string | null;
};

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["full_name", "email", "phone", "linkedin_url", "portfolio_url", "headline", "current_title"],
  properties: {
    full_name: { type: ["string", "null"], description: "The candidate's full name as written on the resume." },
    email: { type: ["string", "null"], description: "The candidate's email address. null if none appears." },
    phone: {
      type: ["string", "null"],
      description: "Phone number exactly as written, including country code if present. null if none appears.",
    },
    linkedin_url: {
      type: ["string", "null"],
      description:
        "Full LinkedIn profile URL (https://linkedin.com/in/…). Reconstruct from a bare handle like 'linkedin.com/in/x' if needed. null if none appears.",
    },
    portfolio_url: {
      type: ["string", "null"],
      description:
        "Personal site, portfolio, or GitHub URL — the single most representative one if several. null if none appears.",
    },
    headline: {
      type: ["string", "null"],
      description:
        "A one-line professional headline for this candidate, e.g. 'Senior Backend Engineer — Go, Kubernetes, 8 yrs'. Compose it from the resume; keep it under 90 characters.",
    },
    current_title: {
      type: ["string", "null"],
      description: "The candidate's current (most recent) job title as stated on the resume. null if unclear.",
    },
  },
} as const;

const EXTRACT_SYSTEM = `You extract contact and profile fields from one resume for a recruiting database. Copy contact details exactly as they appear — never invent or guess an email, phone number, or URL. Only the headline is composed by you; everything else is transcription.`;

type Ok = { ok: true; fields: ExtractedCandidate };
type Err = { ok: false; error: string };

export async function extractResumeFields(storagePath: string, mimeType: string | null): Promise<Ok | Err> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const resume = await resumeContentBlock(storagePath, mimeType);
    if (!resume.ok) return { ok: false, error: resume.error };

    const llm = anthropic();
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: EXTRACT_SYSTEM,
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [resume.block, { type: "text", text: "Extract the candidate fields from this resume." }],
        },
      ],
    });

    const out = readTextOutput(
      "resume-extract",
      MODEL,
      response,
      "The model declined to read this document.",
    );
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = JSON.parse(out.text) as ExtractedCandidate;
    const clean = (s: string | null) => (typeof s === "string" && s.trim() ? s.trim() : null);
    return {
      ok: true,
      fields: {
        full_name: clean(parsed.full_name),
        email: clean(parsed.email),
        phone: clean(parsed.phone),
        linkedin_url: clean(parsed.linkedin_url),
        portfolio_url: clean(parsed.portfolio_url),
        headline: clean(parsed.headline),
        current_title: clean(parsed.current_title),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resume-extract] ${storagePath} failed:`, msg);
    return { ok: false, error: msg };
  }
}
