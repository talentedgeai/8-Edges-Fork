import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { readTextOutput } from "@/kernel/ai/response";
import { updateMeetings } from "@/entities/company-os";

// Summarize a client meeting transcript. Reads the transcript from
// call_transcripts (for the source='notes' meetings row) and asks Claude for a
// title, a concise summary, the attendee list, and the meeting date.
// Same never-throws contract as lib/ai/idea-plan.ts and lib/resume-screen.ts:
// called fire-and-forget (waitUntil) from the meeting actions and from admin
// retry, it always resolves and records failures on ai_error.
//
// Coalesce rule: title, attendees, and meeting_date are only written when the
// row is still blank/empty, so an admin's manual value is never overwritten. The
// summary is always (re)generated.

const MODEL = modelFor("meeting-summary", "fast");

// Keep the transcript within a sane token budget. Meetings rarely exceed this;
// if one does, the tail is dropped and noted (summary of the bulk still lands).
const MAX_TRANSCRIPT_CHARS = 120_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary_markdown", "attendees", "meeting_date"],
  properties: {
    title: {
      type: "string",
      description:
        "A short, specific meeting title (max ~8 words) naming what the meeting was about. " +
        "No date, no company name padding — e.g. 'Q3 roadmap and rollout plan'.",
    },
    summary_markdown: {
      type: "string",
      description:
        "A concise client-facing summary in Markdown, under ~250 words. Structure: a one-line overview " +
        "sentence; then '## Key points' (3-6 bullets of what was discussed/decided); then '## Action items' " +
        "(bullets as 'Owner - task', or 'None noted' if there were none). Ground everything in the transcript; " +
        "do not invent decisions, numbers, or owners that were not said. Neutral, professional tone.",
    },
    attendees: {
      type: "array",
      items: { type: "string" },
      description:
        "The names of people who attended, as spoken/named in the transcript. Names only (no titles/emails). " +
        "Empty array if the transcript gives no reliable way to tell who was present.",
    },
    meeting_date: {
      type: ["string", "null"],
      description:
        "The calendar date the meeting took place, as YYYY-MM-DD, if it can be determined from the transcript " +
        "(an explicit date, or a clearly stated day). Null if it cannot be determined — do not guess.",
    },
  },
} as const;

const SYSTEM = `You are an assistant that turns raw client-meeting transcripts into clean, professional meeting notes for Edge8, an AI consultancy. You produce a short title, a concise summary a client could read, the list of attendees, and the meeting date. Work only from the transcript: never invent attendees, decisions, action items, figures, or a date that is not supported by the text. If something is unclear, leave it out rather than guessing. The summary is written for the client who was in the meeting, so keep it neutral and free of internal asides.`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function markFailed(id: string, error: string): Promise<Err> {
  await updateMeetings({ ai_status: "failed", ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: false, error };
}

export async function summarizeMeeting(meetingId: string): Promise<Ok | Err> {
  try {
    return await run(meetingId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[meeting-summary] ${meetingId} failed:`, msg);
    return markFailed(meetingId, msg);
  }
}

async function run(meetingId: string): Promise<Ok | Err> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return markFailed(meetingId, "ANTHROPIC_API_KEY is not configured.");
  }

  const { data: meeting, error } = await companyOs
    .from("meetings")
    .select("id, title, attendees, started_at, call_transcripts(transcript)")
    .eq("id", meetingId)
    .eq("source", "notes")
    .maybeSingle();
  if (error || !meeting) return markFailed(meetingId, error?.message ?? "Meeting not found.");

  const ct = meeting.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null;
  const rawTranscript = (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? "";
  const transcript = rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript.trim()) return markFailed(meetingId, "Transcript is empty.");

  const llm = anthropic();
  const response = await llm.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Meeting transcript:\n\n${transcript}` }],
  });

  const out = readTextOutput(
    "meeting-summary",
    MODEL,
    response,
    "The model declined to summarize this transcript.",
  );
  if (!out.ok) return markFailed(meetingId, out.error);

  const parsed = JSON.parse(out.text) as {
    title: string;
    summary_markdown: string;
    attendees: string[];
    meeting_date: string | null;
  };
  if (!parsed.summary_markdown?.trim()) {
    return markFailed(meetingId, "Model output was missing the summary.");
  }

  // Coalesce: never overwrite an admin-supplied title/attendees/date. The
  // client-facing summary lives in `summary`; the date in `started_at`.
  const update: Record<string, unknown> = {
    summary: parsed.summary_markdown.trim(),
    summary_encrypted: false,
    ai_model: MODEL,
    ai_status: "ready",
    ai_error: null,
    updated_at: new Date().toISOString(),
  };
  if (!meeting.title?.trim() && parsed.title?.trim()) update.title = parsed.title.trim();
  if ((meeting.attendees ?? []).length === 0 && Array.isArray(parsed.attendees)) {
    const cleaned = parsed.attendees.map((a) => a.trim()).filter(Boolean);
    if (cleaned.length > 0) update.attendees = cleaned;
  }
  if (!meeting.started_at && parsed.meeting_date && ISO_DATE.test(parsed.meeting_date)) {
    update.started_at = parsed.meeting_date;
  }

  const { error: upErr } = await updateMeetings(update).eq("id", meetingId);
  if (upErr) return markFailed(meetingId, upErr.message);

  return { ok: true };
}
