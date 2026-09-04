import { anthropic } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import { supabase, companyOs } from "@/lib/supabase";
import { AI_PANELIST_EMAIL, AI_PANELIST_NAME, DEFAULT_CRITERIA, recommendationToDb } from "@/lib/admin/interview-panel";
import { readTextOutput } from "@/lib/ai/response";

// The AI interview panelist. Given one interview round with a transcript, it
// reads the transcript against the job, the resume screen, prior rounds, and the
// company core values, then writes a scorecard for the AI seat: a recommendation,
// per-criterion scores each backed by a verbatim quote, and a carry-forward block
// (what it confirmed, what is still open, questions for the next round). Mirrors
// lib/resume-screen.ts. Best-effort: it must never throw.

const MODEL = modelFor("interview-panelist", "standard");
const TRANSCRIPT_BUCKET = "meeting-transcripts";

type Ok = { ok: true };
type Err = { ok: false; error: string };

const PANELIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendation", "overall_score", "criteria", "verified", "still_open", "next_round_questions", "summary"],
  properties: {
    recommendation: {
      type: "string",
      enum: ["advance", "hold", "reject"],
      description: "advance = move to the next round or offer; hold = borderline, needs more signal; reject = do not proceed.",
    },
    overall_score: {
      type: "number",
      description: "Overall read of the candidate in THIS round, 1.0 to 5.0 with one decimal. 5 = outstanding, 3 = solid with gaps, 1 = poor. Use the full range.",
    },
    criteria: {
      type: "array",
      description: "One entry per criterion you were asked to score. Score only from transcript evidence.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "score", "evidence", "confidence"],
        properties: {
          name: { type: "string", description: "The criterion name, exactly as given." },
          score: {
            type: ["number", "null"],
            description: "1 to 5, or null if this round genuinely did not test this criterion. Never invent a score.",
          },
          evidence: {
            type: "string",
            description:
              "A short verbatim quote from the transcript that justifies the score, with the speaker timestamp, e.g. 'one main agent can spin up a lot of agent' (08:10). If the criterion was not tested, say so in one line.",
          },
          confidence: {
            type: "string",
            enum: ["high", "low"],
            description: "low when the supporting quote is garbled by transcription or the signal is thin.",
          },
        },
      },
    },
    verified: {
      type: "array",
      items: { type: "string" },
      description: "What this round confirmed about the candidate, each tied to evidence. Empty if nothing was confirmed.",
    },
    still_open: {
      type: "array",
      items: { type: "string" },
      description: "Claims or gaps this round did not resolve (e.g. a resume claim never probed). Empty if none.",
    },
    next_round_questions: {
      type: "array",
      items: { type: "string" },
      description: "Concrete questions the next interviewer should ask to close the open items. Empty if this was the final round.",
    },
    summary: {
      type: "string",
      description: "2-4 sentences: the overall read on the candidate from this round, in plain language.",
    },
  },
} as const;

type PanelistOutput = {
  recommendation: "advance" | "hold" | "reject";
  overall_score: number;
  criteria: { name: string; score: number | null; evidence: string; confidence: "high" | "low" }[];
  verified: string[];
  still_open: string[];
  next_round_questions: string[];
  summary: string;
};

const SYSTEM = `You are an interview panelist for Edge8, an AI consulting and staffing company in Vietnam. You are given the transcript of ONE interview round for one candidate, plus the job, the candidate's resume screen, any earlier rounds, and Edge8's core values. You produce a structured scorecard: a recommendation, a score for each named criterion, and a carry-forward block for the next round.

Rules you must follow:
- Ground every score in the transcript. Quote the exact words behind each score, with the speaker's timestamp. Never score a criterion the round did not actually test: return a null score and say so.
- These transcripts come from automatic speech-to-text and are often garbled (for example "Claude Code" is transcribed as "clock code", product and company names are mangled). Never hold transcription errors against the candidate. When a quote you rely on is garbled, mark that criterion's confidence "low".
- Be fair and specific. Distinguish real, demonstrated experience from name-dropping. Use the full 1 to 5 range rather than clustering at 4.
- You are ONE voice on the panel and you never make the hiring decision. Your job is an honest, evidence-based read that helps the humans decide.
- Judge fit against THIS role and Edge8's values. Weigh the round's purpose (a recruiter screen tests motivation and communication; an engineering round tests depth; a founder round tests values and culture fit).`;

// The AI panelist is a real people row so it can hold a scorecard like any human.
// Identified by a sentinel email; created on first use. (Mirrors the copy in
// interview-actions so the lib has no dependency on a server-action module.)
export async function ensureAiPanelist(): Promise<string> {
  const { data } = await companyOs.from("people").select("id").eq("email", AI_PANELIST_EMAIL).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: created, error } = await companyOs
    .from("people")
    .insert({
      full_name: AI_PANELIST_NAME,
      email: AI_PANELIST_EMAIL,
      is_team_member: false,
      do_not_contact: true,
      source: "system",
      metadata: { is_ai: true },
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create the AI panelist.");
  return created.id as string;
}

export async function scoreInterview(interviewId: string): Promise<Ok | Err> {
  try {
    return await runPanelist(interviewId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[interview-panelist] ${interviewId} failed:`, msg);
    return { ok: false, error: msg };
  }
}

async function runPanelist(interviewId: string): Promise<Ok | Err> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

  // The round + its application + the job.
  const { data: iv, error: ivErr } = await companyOs
    .from("interviews")
    .select("id, title, mode, created_at, application_id")
    .eq("id", interviewId)
    .maybeSingle();
  if (ivErr || !iv) return { ok: false, error: ivErr?.message ?? "Round not found." };

  const { data: app, error: appErr } = await companyOs
    .from("applications")
    .select("id, job_requisition_id, ai_summary, cover_letter, people!person_id ( full_name )")
    .eq("id", iv.application_id)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Application not found." };
  const person = Array.isArray(app.people) ? app.people[0] : app.people;
  const candidateName = (person?.full_name as string | null) || "the candidate";

  const transcript = await loadTranscript(interviewId);
  if (!transcript.ok) return transcript;

  const [reqRes, valuesRes, priorRes] = await Promise.all([
    companyOs
      .from("job_requisitions")
      .select("title, requirements, responsibilities, full_jd")
      .eq("id", app.job_requisition_id)
      .maybeSingle(),
    companyOs.from("core_values").select("title, description").order("sort_order", { ascending: true }),
    priorRounds(iv.application_id, iv.created_at as string),
  ]);
  const req = reqRes.data;

  const jd = [
    `Title: ${req?.title ?? "(untitled)"}`,
    req?.requirements && `\n## Requirements\n${req.requirements}`,
    req?.responsibilities && `\n## Responsibilities\n${req.responsibilities}`,
    req?.full_jd && `\n## Full job description\n${req.full_jd}`,
  ]
    .filter(Boolean)
    .join("\n");

  const values = (valuesRes.data ?? [])
    .map((v) => `- ${v.title as string}${v.description ? `: ${v.description as string}` : ""}`)
    .join("\n");

  const resumeScreen = app.ai_summary
    ? `## Resume screen (already run)\n${JSON.stringify(app.ai_summary)}`
    : "";

  const criteria = DEFAULT_CRITERIA.join(", ");

  const userText = [
    `# Candidate\n${candidateName}`,
    `\n# This interview round\nTitle: ${iv.title ?? "Interview"} (mode: ${iv.mode})`,
    `\n# Job we are hiring for\n${jd}`,
    values && `\n# Edge8 core values\n${values}`,
    resumeScreen && `\n# ${resumeScreen}`,
    priorRes && `\n# Earlier rounds\n${priorRes}`,
    `\n# Criteria to score\n${criteria}`,
    `\n# Transcript of this round\n${transcript.text}`,
    `\nScore this round. Quote the transcript for every score, mark garbled quotes low-confidence, and never penalise transcription errors.`,
  ]
    .filter(Boolean)
    .join("\n");

  const llm = anthropic();
  const response = await llm.messages.create({
    model: MODEL,
    // Standard tier: this runs via waitUntil on every transcript upload, so it
    // sits under the Haiku/Sonnet-for-operational-AI cost policy. Override with
    // INTERVIEW_CLAUDE_MODEL (or AI_MODEL_INTERVIEW_PANELIST) if a round needs more.
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: PANELIST_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });

  const out = readTextOutput(
    "interview-panelist",
    MODEL,
    response,
    "The model declined to score this interview.",
  );
  if (!out.ok) return { ok: false, error: out.error };

  const parsed = JSON.parse(out.text) as PanelistOutput;
  return writeScorecard(interviewId, parsed);
}

// Persist the panelist output onto the AI seat: the scorecard row plus one
// score row per criterion. The carry-forward block is appended to the summary
// so the humans see it alongside the read. Re-runnable: replaces prior rows.
export async function writeScorecard(interviewId: string, out: PanelistOutput): Promise<Ok | Err> {
  const aiId = await ensureAiPanelist();
  const overall = clampScore(out.overall_score);

  const summary = [
    out.summary.trim(),
    out.verified.length ? `\n\nVerified this round:\n${out.verified.map((v) => `• ${v}`).join("\n")}` : "",
    out.still_open.length ? `\n\nStill open:\n${out.still_open.map((v) => `• ${v}`).join("\n")}` : "",
    out.next_round_questions.length
      ? `\n\nSuggested next-round questions:\n${out.next_round_questions.map((v) => `• ${v}`).join("\n")}`
      : "",
  ].join("");

  const { data: sc, error: scErr } = await companyOs
    .from("interview_scorecards")
    .upsert(
      {
        interview_id: interviewId,
        interviewer_id: aiId,
        recommendation: recommendationToDb(out.recommendation),
        overall_score: overall,
        summary,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id,interviewer_id" },
    )
    .select("id")
    .single();
  if (scErr || !sc) return { ok: false, error: scErr?.message ?? "Could not write the scorecard." };
  const scorecardId = sc.id as string;

  await companyOs.from("scorecard_scores").delete().eq("scorecard_id", scorecardId);
  const rows = out.criteria
    .filter((c) => c.name.trim())
    .map((c, i) => ({
      scorecard_id: scorecardId,
      criterion: c.name.trim(),
      score: c.score == null ? null : clampScore(c.score),
      comment: [c.evidence?.trim(), c.confidence === "low" ? "(low confidence: transcription)" : ""]
        .filter(Boolean)
        .join(" "),
      position: i,
    }));
  if (rows.length > 0) {
    const { error: rowErr } = await companyOs.from("scorecard_scores").insert(rows);
    if (rowErr) return { ok: false, error: rowErr.message };
  }
  return { ok: true };
}

async function loadTranscript(interviewId: string): Promise<{ ok: true; text: string } | Err> {
  const { data: doc, error } = await companyOs
    .from("documents")
    .select("storage_path")
    .eq("entity_type", "interview")
    .eq("entity_id", interviewId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !doc?.storage_path) return { ok: false, error: "No transcript on file for this round." };
  const { data, error: dlErr } = await supabase.storage.from(TRANSCRIPT_BUCKET).download(doc.storage_path);
  if (dlErr || !data) return { ok: false, error: `Could not download transcript: ${dlErr?.message ?? "no data"}` };
  const text = Buffer.from(await data.arrayBuffer()).toString("utf8").trim();
  if (!text) return { ok: false, error: "Transcript is empty." };
  return { ok: true, text };
}

// Earlier rounds' scorecards (not full transcripts) give the panelist continuity
// without ballooning the prompt.
async function priorRounds(applicationId: string, createdAt: string): Promise<string> {
  const { data } = await companyOs
    .from("interviews")
    .select("title, created_at, interview_scorecards ( recommendation, overall_score, summary )")
    .eq("application_id", applicationId)
    .lt("created_at", createdAt)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return "";
  return data
    .map((r) => {
      const cards = (r.interview_scorecards ?? []) as Record<string, unknown>[];
      const lines = cards
        .map((c) => `  - ${c.recommendation ?? "?"} (${c.overall_score ?? "?"}/5): ${((c.summary as string) ?? "").slice(0, 300)}`)
        .join("\n");
      return `Round "${r.title ?? "Interview"}":\n${lines || "  (no scorecards)"}`;
    })
    .join("\n");
}

function clampScore(v: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 3;
  return Math.min(5, Math.max(1, Math.round(v * 10) / 10));
}
