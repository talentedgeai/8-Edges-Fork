"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { companyOs, supabase } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { waitUntil } from "@vercel/functions";
import { ensureAiPanelist, scoreInterview } from "@/lib/interview-panelist";
import { writeScorecard, type ScorecardInput } from "@/lib/ats/scorecard";
import {
  ROUND_MODES,
  recommendationFromDb,
  isAiPanelist,
  type RecommendationKey,
} from "@/lib/admin/interview-panel";

type Result = { ok: true } | { ok: false; error: string };

const TRANSCRIPT_BUCKET = "meeting-transcripts";
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;
const MODE_VALUES = new Set<string>(ROUND_MODES.map((m) => m.value));
const SEAT_ROLES = new Set(["lead", "interviewer", "shadow", "observer"]);

export type PanelSeat = {
  interviewerId: string;
  name: string;
  role: string;
  isAi: boolean;
  scorecard: SeatScorecard | null;
};

export type SeatScorecard = {
  recommendation: RecommendationKey | null;
  overallScore: number | null;
  summary: string | null;
  submittedAt: string | null;
  scores: { criterion: string; score: number | null; comment: string | null }[];
};

export type InterviewRound = {
  id: string;
  title: string | null;
  mode: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string | null;
  transcriptDocId: string | null;
  seats: PanelSeat[];
};

export type TeamOption = { id: string; name: string };

// Team members eligible to sit on a panel.
export async function listTeamMembers(): Promise<{ ok: true; members: TeamOption[] } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const { data, error } = await companyOs
    .from("people")
    .select("id, full_name, email")
    .eq("is_team_member", true)
    .order("full_name");
  if (error) return { ok: false, error: error.message };
  const members: TeamOption[] = (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || (p.email as string | null) || "team member",
  }));
  return { ok: true, members };
}

// All interview rounds for one application, each with its panel seats and any
// submitted scorecards. Nested embeds ride the FKs. The transcript is the most
// recent document filed against the interview.
export async function getInterviewRounds(
  applicationId: string,
): Promise<{ ok: true; rounds: InterviewRound[] } | { ok: false; error: string }> {
  await requireSuperAdmin();

  const { data, error } = await companyOs
    .from("interviews")
    .select(
      `id, title, mode, status, scheduled_at, created_at,
       interview_interviewers ( interviewer_id, role, people!interviewer_id ( full_name, email, metadata ) ),
       interview_scorecards ( interviewer_id, recommendation, overall_score, summary, submitted_at,
         scorecard_scores ( criterion, score, comment, position ) )`,
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const interviewIds = (data ?? []).map((r) => r.id as string);
  const transcriptByInterview = new Map<string, string>();
  if (interviewIds.length > 0) {
    const { data: docs } = await companyOs
      .from("documents")
      .select("id, entity_id, created_at")
      .eq("entity_type", "interview")
      .in("entity_id", interviewIds)
      .order("created_at", { ascending: false });
    for (const d of docs ?? []) {
      const eid = d.entity_id as string;
      if (!transcriptByInterview.has(eid)) transcriptByInterview.set(eid, d.id as string);
    }
  }

  const rounds: InterviewRound[] = (data ?? []).map((r) => {
    const scorecards = (r.interview_scorecards ?? []) as Record<string, unknown>[];
    const scByInterviewer = new Map<string, Record<string, unknown>>();
    for (const sc of scorecards) scByInterviewer.set(sc.interviewer_id as string, sc);

    const seats: PanelSeat[] = ((r.interview_interviewers ?? []) as Record<string, unknown>[]).map((iv) => {
      const person = (Array.isArray(iv.people) ? iv.people[0] : iv.people) as
        | { full_name?: string | null; email?: string | null; metadata?: unknown }
        | null;
      const sc = scByInterviewer.get(iv.interviewer_id as string);
      const scores = sc
        ? ((sc.scorecard_scores ?? []) as Record<string, unknown>[])
            .slice()
            .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0))
            .map((s) => ({
              criterion: s.criterion as string,
              score: (s.score as number | null) ?? null,
              comment: (s.comment as string | null) ?? null,
            }))
        : [];
      const submitted = sc ? ((sc.submitted_at as string | null) ?? null) : null;
      return {
        interviewerId: iv.interviewer_id as string,
        name: (person?.full_name as string | null) || (person?.email as string | null) || "panelist",
        role: (iv.role as string) ?? "interviewer",
        isAi: isAiPanelist(person),
        scorecard: sc
          ? {
              recommendation: recommendationFromDb(sc.recommendation as string | null),
              overallScore: (sc.overall_score as number | null) ?? null,
              summary: (sc.summary as string | null) ?? null,
              submittedAt: submitted,
              scores,
            }
          : null,
      };
    });
    // Humans first, AI last; both alphabetical within their group.
    seats.sort((a, b) => Number(a.isAi) - Number(b.isAi) || a.name.localeCompare(b.name));

    return {
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      mode: (r.mode as string) ?? "video",
      status: (r.status as string) ?? "scheduled",
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      transcriptDocId: transcriptByInterview.get(r.id as string) ?? null,
      seats,
    };
  });

  return { ok: true, rounds };
}

// Create a round: the interview plus one seat per human panelist, plus the AI
// panelist's seat (always). The first human is the lead. Requires at least one
// human — a round with no interviewer is not a round.
export async function createInterviewRound(
  applicationId: string,
  input: { title: string; mode: string; scheduledAt: string | null; panelistIds: string[] },
): Promise<{ ok: true; roundId: string } | { ok: false; error: string }> {
  const admin = await requireSuperAdmin();

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the round a title." };
  if (!MODE_VALUES.has(input.mode)) return { ok: false, error: "Unknown interview mode." };
  const panelistIds = [...new Set(input.panelistIds.filter(Boolean))];
  if (panelistIds.length === 0) return { ok: false, error: "Add at least one human panelist." };

  const { data: app, error: appErr } = await companyOs
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Application not found." };

  const { data: interview, error: ivErr } = await companyOs
    .from("interviews")
    .insert({
      application_id: applicationId,
      title,
      mode: input.mode,
      scheduled_at: input.scheduledAt,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (ivErr || !interview) return { ok: false, error: ivErr?.message ?? "Could not create the round." };
  const roundId = interview.id as string;

  let aiId: string;
  try {
    aiId = await ensureAiPanelist();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not seat the AI panelist." };
  }

  const seatRows = [
    ...panelistIds.map((id, i) => ({ interview_id: roundId, interviewer_id: id, role: i === 0 ? "lead" : "interviewer" })),
    { interview_id: roundId, interviewer_id: aiId, role: "interviewer" },
  ];
  const { error: seatErr } = await companyOs.from("interview_interviewers").insert(seatRows);
  if (seatErr) return { ok: false, error: seatErr.message };

  await recordAudit({
    table: "interviews",
    recordId: roundId,
    operation: "insert",
    actor: admin.email,
    newData: { application_id: applicationId, title, mode: input.mode, panelists: panelistIds.length },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true, roundId };
}

// Delete a round. interview_interviewers / interview_scorecards / scorecard_scores
// cascade on the interview FK; transcript documents have no FK, so remove those
// rows explicitly (the storage files are kept, matching the resume-replace policy).
export async function deleteInterviewRound(roundId: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  await companyOs.from("documents").delete().eq("entity_type", "interview").eq("entity_id", roundId);
  const { error } = await companyOs.from("interviews").delete().eq("id", roundId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "interviews", recordId: roundId, operation: "delete", actor: admin.email });
  revalidatePath("/admin/talent/applications");
  return { ok: true };
}

// Add a human panelist to an existing round.
export async function addPanelist(roundId: string, personId: string, role: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!SEAT_ROLES.has(role)) return { ok: false, error: "Unknown panel role." };
  const { error } = await companyOs
    .from("interview_interviewers")
    .insert({ interview_id: roundId, interviewer_id: personId, role });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That person is already on this panel." };
    return { ok: false, error: error.message };
  }
  await recordAudit({
    table: "interview_interviewers",
    recordId: roundId,
    operation: "insert",
    actor: admin.email,
    newData: { interviewer_id: personId, role },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true };
}

// Remove a seat. Blocked for the AI panelist (it always holds a seat) and once
// a scorecard has been submitted for that seat (delete the round instead).
export async function removePanelist(roundId: string, interviewerId: string): Promise<Result> {
  const admin = await requireSuperAdmin();

  const { data: person } = await companyOs
    .from("people")
    .select("email, metadata")
    .eq("id", interviewerId)
    .maybeSingle();
  if (isAiPanelist(person)) return { ok: false, error: "The AI panelist always holds a seat." };

  const { data: sc } = await companyOs
    .from("interview_scorecards")
    .select("id")
    .eq("interview_id", roundId)
    .eq("interviewer_id", interviewerId)
    .maybeSingle();
  if (sc) return { ok: false, error: "This panelist already submitted a scorecard." };

  const { error } = await companyOs
    .from("interview_interviewers")
    .delete()
    .eq("interview_id", roundId)
    .eq("interviewer_id", interviewerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "interview_interviewers",
    recordId: roundId,
    operation: "delete",
    actor: admin.email,
    newData: { interviewer_id: interviewerId },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true };
}

// Store a transcript file (or the pasted text) against a round as a document in
// the private meeting-transcripts bucket, and mark the round completed. A new
// document is filed each time; getInterviewRounds surfaces the most recent.
async function fileTranscript(
  roundId: string,
  buffer: Buffer,
  filename: string,
  mime: string,
  actorEmail: string,
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const { data: iv, error: ivErr } = await companyOs
    .from("interviews")
    .select("id, title")
    .eq("id", roundId)
    .maybeSingle();
  if (ivErr || !iv) return { ok: false, error: ivErr?.message ?? "Round not found." };

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "transcript.txt";
  const storagePath = `interviews/${roundId}/${randomUUID()}-${safe}`;
  const { error: upErr } = await supabase.storage
    .from(TRANSCRIPT_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data: doc, error: dErr } = await companyOs
    .from("documents")
    .insert({
      title: `Transcript — ${(iv.title as string | null) || "interview"}`,
      storage_path: storagePath,
      mime_type: mime,
      byte_size: buffer.byteLength,
      entity_type: "interview",
      entity_id: roundId,
    })
    .select("id")
    .single();
  if (dErr || !doc) return { ok: false, error: dErr?.message ?? "Could not save the transcript." };

  await companyOs.from("interviews").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", roundId);
  await recordAudit({
    table: "documents",
    recordId: doc.id as string,
    operation: "insert",
    actor: actorEmail,
    newData: { entity_type: "interview", entity_id: roundId, byte_size: buffer.byteLength },
  });
  // The AI panelist scores as soon as a transcript lands. Runs after the response
  // (a model call takes seconds); the scorecard stays blind in the UI until the
  // human panelists submit theirs.
  waitUntil(scoreInterview(roundId));
  revalidatePath("/admin/talent/applications");
  return { ok: true, documentId: doc.id as string };
}

export async function uploadInterviewTranscript(
  roundId: string,
  formData: FormData,
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const admin = await requireSuperAdmin();
  const file = formData.get("transcript");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
  if (file.size > MAX_TRANSCRIPT_BYTES) return { ok: false, error: "Transcript is too large (max 10 MB)." };
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "text/plain";
  return fileTranscript(roundId, buffer, file.name || "transcript.txt", mime, admin.email);
}

export async function saveTranscriptText(
  roundId: string,
  text: string,
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const admin = await requireSuperAdmin();
  const body = text.trim();
  if (!body) return { ok: false, error: "Paste the transcript first." };
  if (Buffer.byteLength(body) > MAX_TRANSCRIPT_BYTES) return { ok: false, error: "Transcript is too large (max 10 MB)." };
  return fileTranscript(roundId, Buffer.from(body, "utf8"), "transcript.txt", "text/plain", admin.email);
}

// Download and return the round's current transcript as text. Text transcripts
// (Lark exports, pasted notes) decode directly; anything else is returned as a
// best-effort UTF-8 read.
export async function getTranscript(
  roundId: string,
): Promise<{ ok: true; text: string; mime: string | null } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const { data: doc, error } = await companyOs
    .from("documents")
    .select("storage_path, mime_type")
    .eq("entity_type", "interview")
    .eq("entity_id", roundId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !doc?.storage_path) return { ok: false, error: error?.message ?? "No transcript on file." };

  const { data, error: dlErr } = await supabase.storage.from(TRANSCRIPT_BUCKET).download(doc.storage_path);
  if (dlErr || !data) return { ok: false, error: `Could not download transcript: ${dlErr?.message ?? "no data"}` };
  const text = Buffer.from(await data.arrayBuffer()).toString("utf8");
  return { ok: true, text, mime: (doc.mime_type as string | null) ?? null };
}

// Submit (or resubmit) a human panelist's scorecard for a round. The write is
// shared with the team interview kit (lib/ats/scorecard); admin adds the audit
// trail and cache bust on top.
export async function submitScorecard(
  roundId: string,
  interviewerId: string,
  input: ScorecardInput,
): Promise<Result> {
  const admin = await requireSuperAdmin();
  const r = await writeScorecard(roundId, interviewerId, input);
  if (!r.ok) return r;
  await recordAudit({
    table: "interview_scorecards",
    recordId: r.scorecardId,
    operation: "update",
    actor: admin.email,
    newData: { interview_id: roundId, interviewer_id: interviewerId, recommendation: input.recommendation },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true };
}

// Run (or re-run) the AI panelist for one round on demand. The scorecard write
// is blind-first: it lands immediately but the UI withholds it until every human
// on the round has submitted. Returns the model error verbatim so the UI can show it.
export async function runAiPanelist(roundId: string): Promise<Result> {
  await requireSuperAdmin();
  const r = await scoreInterview(roundId);
  if (!r.ok) return r;
  revalidatePath("/admin/talent/applications");
  return { ok: true };
}
