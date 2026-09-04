import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import mammoth from "mammoth";
import { supabase, companyOs } from "@/lib/supabase";
import { setCandidateAiSalary } from "@/lib/admin/candidate-sensitive";
import { readTextOutput } from "@/lib/ai/response";

// AI resume screen: reads an application's resume + the job requisition,
// asks Claude for a templated summary and a 0-5 fit rating, and writes the
// result onto the application (ai_* columns). Called via waitUntil() from the
// apply route and from admin re-scan actions — it must never throw.

const MODEL = modelFor("resume-screen", "standard");

// Salary is deliberately NOT here: the AI still extracts it (SCREEN_SCHEMA
// keeps the field), but it is stored on the restricted candidate_sensitive
// store, never on applications.ai_summary, which is read broadly across the ATS.
export type AiScreenSummary = {
  overview: string;
  skills: string[];
  english: string;
  notice_period: string;
};

const SCREEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "skills", "rating", "english", "salary_expectation", "notice_period"],
  properties: {
    overview: {
      type: "string",
      description:
        "One paragraph summarizing the candidate: role, years of experience, what they have owned end-to-end, and their most relevant concrete accomplishments for this specific job.",
    },
    skills: {
      type: "array",
      items: { type: "string" },
      description:
        "5-8 bullet points. Mix grouped skill lines (e.g. 'AI Product Development: Claude Code, Multi-Agent Systems, MCP Servers') with evaluative points that tie the candidate's real experience to the job's key hiring criteria (e.g. 'Demonstrated real-world experience building products with Claude Code rather than simply using AI tools, which directly matches one of the key hiring criteria.').",
    },
    rating: {
      type: "number",
      description:
        "Overall fit against the job requisition, 0.0 to 5.0 with one decimal (e.g. 3.7). 5 = exceptional match on every key criterion; 3 = solid but with real gaps; 1 = poor fit. Weigh the resume, cover letter, and screening answers.",
    },
    english: {
      type: "string",
      description:
        "English proficiency judged from the resume and cover letter writing plus any stated qualifications, e.g. 'Fluent', 'Professional working proficiency'. 'Unknown' if there is no signal.",
    },
    salary_expectation: {
      type: "string",
      description:
        "Salary expectation exactly as stated anywhere in the application (e.g. '32M VND'). 'Not stated' if absent. Never guess.",
    },
    notice_period: {
      type: "string",
      description:
        "Notice period / availability as stated (e.g. 'ASAP', '30 days'). 'Not stated' if absent. Never guess.",
    },
  },
} as const;

const SCREEN_SYSTEM = `You are the recruiting screener for Edge8, an AI consulting and staffing company in Vietnam. You review one job application at a time against its job requisition and produce a structured screen: a summary following Edge8's template, plus a 0-5 fit rating used to stack-rank all applicants for the role.

Ground every claim in the provided material. Distinguish candidates who have genuinely built things from those who list buzzwords. Note concrete outcomes (shipped products, paying customers, metrics) when present. Be direct about gaps relative to the job requirements — the rating must differentiate candidates, so use the full scale rather than clustering around 4.`;

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function markFailed(applicationId: string, error: string): Promise<Err> {
  await companyOs
    .from("applications")
    .update({
      ai_screen_status: "failed",
      ai_screen_error: error.slice(0, 500),
      ai_screened_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  return { ok: false, error };
}

// Resolve the resume into an Anthropic content block. PDFs go to the API
// natively (handles scanned resumes too); .docx is extracted to text with
// mammoth; legacy .doc has no reliable server-side extractor. Exported for the
// admin add-candidates intake, which extracts fields from the same bucket.
export async function resumeContentBlock(
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
  return { ok: false, error: "Unsupported resume format for AI scan (only PDF and .docx). Ask the candidate for a PDF." };
}

export async function screenApplication(applicationId: string): Promise<Ok | Err> {
  try {
    return await runScreen(applicationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resume-screen] ${applicationId} failed:`, msg);
    return markFailed(applicationId, msg);
  }
}

async function runScreen(applicationId: string): Promise<Ok | Err> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return markFailed(applicationId, "ANTHROPIC_API_KEY is not configured.");
  }

  await companyOs
    .from("applications")
    .update({ ai_screen_status: "pending", ai_screen_error: null })
    .eq("id", applicationId);

  const { data: app, error: appErr } = await companyOs
    .from("applications")
    .select("id, person_id, cover_letter, answers, resume_document_id, job_requisition_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) return markFailed(applicationId, appErr?.message ?? "Application not found.");
  if (!app.resume_document_id) return markFailed(applicationId, "No resume on file for this application.");

  const [reqRes, docRes] = await Promise.all([
    companyOs
      .from("job_requisitions")
      .select("title, location, employment_type, remote_policy, description, requirements, responsibilities, full_jd")
      .eq("id", app.job_requisition_id)
      .maybeSingle(),
    companyOs
      .from("documents")
      .select("storage_path, mime_type")
      .eq("id", app.resume_document_id)
      .maybeSingle(),
  ]);
  if (reqRes.error || !reqRes.data) return markFailed(applicationId, reqRes.error?.message ?? "Job requisition not found.");
  if (docRes.error || !docRes.data) return markFailed(applicationId, docRes.error?.message ?? "Resume document not found.");
  const req = reqRes.data;

  const resume = await resumeContentBlock(docRes.data.storage_path, docRes.data.mime_type);
  if (!resume.ok) return markFailed(applicationId, resume.error);

  const jdParts = [
    `Title: ${req.title ?? "(untitled)"}`,
    req.location && `Location: ${req.location}`,
    req.employment_type && `Employment type: ${req.employment_type}`,
    req.remote_policy && `Remote policy: ${req.remote_policy}`,
    req.description && `\n## Description\n${req.description}`,
    req.requirements && `\n## Requirements\n${req.requirements}`,
    req.responsibilities && `\n## Responsibilities\n${req.responsibilities}`,
    req.full_jd && `\n## Full job description\n${req.full_jd}`,
  ].filter(Boolean);

  const answers = Array.isArray(app.answers) ? (app.answers as { q: string; a: string }[]) : [];
  const extraParts = [
    app.cover_letter && `## Cover letter\n${app.cover_letter}`,
    answers.length > 0 &&
      `## Screening question answers\n${answers.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n\n")}`,
  ].filter(Boolean);

  const llm = anthropic();
  const response = await llm.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SCREEN_SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCREEN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          resume.block,
          {
            type: "text",
            text: `# Job requisition we are hiring for\n${jdParts.join("\n")}${
              extraParts.length > 0 ? `\n\n# Rest of the application\n${extraParts.join("\n\n")}` : ""
            }\n\nScreen this application against the job requisition.`,
          },
        ],
      },
    ],
  });

  const out = readTextOutput(
    "resume-screen",
    MODEL,
    response,
    "The model declined to screen this document.",
  );
  if (!out.ok) return markFailed(applicationId, out.error);

  const parsed = JSON.parse(out.text) as AiScreenSummary & {
    rating: number;
    salary_expectation: string;
  };
  const rating = Math.min(5, Math.max(0, Math.round(parsed.rating * 10) / 10));
  const summary: AiScreenSummary = {
    overview: parsed.overview,
    skills: parsed.skills,
    english: parsed.english,
    notice_period: parsed.notice_period,
  };

  // Salary is sensitive: keep it out of ai_summary; store on the restricted
  // candidate_sensitive store (super-admin-only). Best-effort, never blocks.
  await setCandidateAiSalary(app.person_id as string | null, parsed.salary_expectation);

  const { error: upErr } = await companyOs
    .from("applications")
    .update({
      ai_summary: summary,
      ai_rating: rating,
      ai_screen_status: "done",
      ai_screen_error: null,
      ai_screened_at: new Date().toISOString(),
      ai_model: MODEL,
    })
    .eq("id", applicationId);
  if (upErr) return markFailed(applicationId, upErr.message);

  return { ok: true };
}
