import { companyOs } from "@/lib/supabase";

// Coaching 1-1 transcripts live in the central meetings table: each
// coaching_one_on_ones row links (meeting_id) to a meetings row whose
// call_transcripts holds the text. This helper is the single place the coaching
// flow creates/links that meeting and reads/writes the transcript, so no
// coaching code has to know the call_transcripts shape.
//
// Bulk reads (the coach's meeting list) instead embed the transcript directly in
// the coaching_one_on_ones select; see MEETING_SELECT in data.ts.

type LinkRow = {
  id: string;
  held_on: string | null;
  meeting_id: string | null;
  coach_id: string | null;
};

async function loadLink(coachingId: string): Promise<LinkRow | null> {
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on, meeting_id, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .eq("id", coachingId)
    .maybeSingle();
  if (!data) return null;
  const prof = Array.isArray(data.coaching_profiles) ? data.coaching_profiles[0] : data.coaching_profiles;
  return {
    id: data.id as string,
    held_on: (data.held_on as string | null) ?? null,
    meeting_id: (data.meeting_id as string | null) ?? null,
    coach_id: (prof?.coach_id as string | null) ?? null,
  };
}

// Return the coaching session's linked meeting id, creating a coaching-origin
// meeting (source='coaching', type '1-1') and setting meeting_id if there is none.
export async function ensureCoachingMeeting(coachingId: string): Promise<string | null> {
  const row = await loadLink(coachingId);
  if (!row) return null;
  if (row.meeting_id) return row.meeting_id;

  const title = `1-1 on ${row.held_on ?? "(undated)"}`;
  const { data, error } = await companyOs
    .from("meetings")
    .insert({
      source: "coaching",
      meeting_type: "1-1",
      title,
      started_at: row.held_on,
      owner_id: row.coach_id,
      metadata: { origin: "coaching", coaching_one_on_one_id: row.id },
    })
    .select("id")
    .single();
  if (error || !data) return null;

  await companyOs
    .from("coaching_one_on_ones")
    .update({ meeting_id: data.id, updated_at: new Date().toISOString() })
    .eq("id", coachingId);
  return data.id as string;
}

export async function readCoachingTranscript(meetingId: string | null): Promise<string | null> {
  if (!meetingId) return null;
  const { data } = await companyOs
    .from("call_transcripts")
    .select("transcript")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  return (data?.transcript as string | null) ?? null;
}

type SaveResult = { ok: true; meetingId: string } | { ok: false; error: string };

// Store (or replace) a coaching session's transcript in call_transcripts,
// creating/linking its meeting first. One transcript per meeting.
export async function saveCoachingTranscript(coachingId: string, transcript: string): Promise<SaveResult> {
  const meetingId = await ensureCoachingMeeting(coachingId);
  if (!meetingId) return { ok: false, error: "Could not link the coaching session to a meeting." };
  const row = await loadLink(coachingId);

  const { error } = await companyOs.from("call_transcripts").upsert(
    {
      meeting_id: meetingId,
      title: `1-1 on ${row?.held_on ?? "(undated)"}`,
      started_at: row?.held_on ?? null,
      source: "coaching",
      call_type: "internal",
      transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meeting_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, meetingId };
}
