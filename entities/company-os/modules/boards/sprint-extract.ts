import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { readTextOutput } from "@/kernel/ai/response";

// Per-client extraction from a multi-client meeting. The weekly planning/retro
// meeting covers several clients in one transcript; the meeting stays ONE
// record (company_os.meetings + call_transcripts), and the separation happens
// here: given the board's client, pull out only what was said about that
// client. The result is a DRAFT the user reviews in the sprint brief before
// saving — nothing is written by this module.

const MODEL = modelFor("sprint-extract", "fast");

// Transcripts can outgrow the context we want to spend; keep the newest text.
const MAX_TRANSCRIPT_CHARS = 300_000;

export type SprintBriefDraft = {
  goal: string | null;
  focus_improvement: string | null;
  going_well: string | null;
  meeting_summary: string | null;
};

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "focus_improvement", "going_well", "meeting_summary"],
  properties: {
    goal: {
      type: ["string", "null"],
      description: "The goal set for this client's upcoming sprint, in one or two sentences. null if no goal was discussed for this client.",
    },
    focus_improvement: {
      type: ["string", "null"],
      description: "The number one thing the team said it is trying to improve for this client, from the retrospective part of the meeting. null if none was named.",
    },
    going_well: {
      type: ["string", "null"],
      description: "A short summary of what is going well for this client, from the retrospective. null if not discussed.",
    },
    meeting_summary: {
      type: ["string", "null"],
      description: "A concise summary (3 to 6 sentences) of everything else discussed about this client: decisions, risks, follow-ups. null if the client was not discussed.",
    },
  },
} as const;

const SYSTEM = `You extract sprint-planning notes for ONE client from a team meeting transcript that covers multiple clients. Only use parts of the transcript that are clearly about the named client; ignore every other client and general chatter. Write in plain, direct English. Never use em dashes. If the transcript does not cover a field for this client, return null for it rather than guessing.`;

type Ok = { ok: true; draft: SprintBriefDraft };
type Err = { ok: false; error: string };

export async function extractSprintBrief(meetingId: string, clientName: string): Promise<Ok | Err> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const [meetingRes, transcriptRes] = await Promise.all([
      companyOs.from("meetings").select("title, started_at").eq("id", meetingId).maybeSingle(),
      companyOs
        .from("call_transcripts")
        .select("transcript, started_at")
        .eq("meeting_id", meetingId)
        .order("started_at", { ascending: true }),
    ]);
    if (!meetingRes.data) return { ok: false, error: "Meeting not found." };

    const transcript = ((transcriptRes.data ?? []) as { transcript: string | null }[])
      .map((t) => t.transcript ?? "")
      .join("\n\n")
      .trim();
    if (!transcript) {
      return { ok: false, error: "No transcript is synced for this meeting yet. Transcripts sync nightly from Lark Minutes." };
    }
    const clipped = transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(-MAX_TRANSCRIPT_CHARS) : transcript;

    const meeting = meetingRes.data as { title: string | null; started_at: string | null };
    const llm = anthropic();
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Meeting: ${meeting.title ?? "Untitled"} (${meeting.started_at ?? "unknown date"})\n` +
                `Client to extract for: ${clientName}\n\nTranscript:\n${clipped}`,
            },
          ],
        },
      ],
    });

    const out = readTextOutput(
      "sprint-extract",
      MODEL,
      response,
      "The model declined to read this transcript.",
    );
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = JSON.parse(out.text) as SprintBriefDraft;
    const clean = (s: string | null) => (typeof s === "string" && s.trim() ? s.trim() : null);
    return {
      ok: true,
      draft: {
        goal: clean(parsed.goal),
        focus_improvement: clean(parsed.focus_improvement),
        going_well: clean(parsed.going_well),
        meeting_summary: clean(parsed.meeting_summary),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sprint-extract] meeting ${meetingId} failed:`, msg);
    return { ok: false, error: msg };
  }
}
