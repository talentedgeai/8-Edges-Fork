import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { saveCoachingTranscript } from "@/entities/team/modules/coaching/transcript";
import { one } from "@/kernel/config/embedded";
import { type OneOnOneStatus } from "../types";
import { MEETING_SELECT, toOneOnOne, type OneOnOne } from "./profile";
import { assertCoachOwnsProfile, patchMeeting, patchProfile, type Result } from "./shared";

// Create a 1-1 row. `held` logs a meeting that already happened (transcript
// flow follows); `scheduled` books the next one and mirrors the date onto the
// profile so cadence math and the cron see it.
export async function coachCreateOneOnOne(
  actor: TeamActor,
  profileId: string,
  heldOn: string,
  status: Extract<OneOnOneStatus, "scheduled" | "held">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Bad date." };
  if (status !== "scheduled" && status !== "held") return { ok: false, error: "Bad status." };
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .insert({ coaching_profile_id: profileId, held_on: heldOn, status })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not create the 1-1." };
  if (status === "scheduled") await patchProfile(profileId, { next_one_on_one_on: heldOn });
  return { ok: true, id: (data as { id: string }).id };
}

// Meeting-scoped ownership: the meeting must belong to a profile this actor
// coaches. Returns { meeting, profileId } or null.
export async function assertCoachOwnsMeeting(
  actor: TeamActor,
  meetingId: string,
): Promise<{ meeting: OneOnOne; profileId: string } | null> {
  if (!meetingId) return null;
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select(`${MEETING_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", meetingId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  if (prof?.coach_id !== actor.teamMemberId) return null;
  return { meeting: toOneOnOne(r), profileId: r.coaching_profile_id as string };
}

// Save the transcript and mark the meeting held. The AI summary runs after
// this (lib/coaching/ai.ts); saving the raw transcript never blocks on it.
export async function coachSaveTranscript(
  actor: TeamActor,
  meetingId: string,
  transcript: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const text = transcript.trim();
  if (!text) return { ok: false, error: "Paste the transcript first." };
  if (text.length > 400_000) return { ok: false, error: "Transcript is too long." };
  // Transcript is stored on the linked meeting (call_transcripts), not on the
  // coaching row.
  const saved = await saveCoachingTranscript(meetingId, text);
  if (!saved.ok) return saved;
  return patchMeeting(meetingId, { status: "held" });
}

// Coach edits of the two summary tiers. Editing the shared recap does NOT
// publish it; publish is its own explicit action.
export async function coachSaveSummaries(
  actor: TeamActor,
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, {
    summary_markdown: summaryMarkdown.trim() || null,
    shared_summary_markdown: sharedSummaryMarkdown.trim() || null,
  });
}

// The publish gate: only after this does the member see the shared recap.
export async function coachPublishSharedRecap(
  actor: TeamActor,
  meetingId: string,
  publish: boolean,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (publish && !owned.meeting.sharedSummaryMarkdown?.trim())
    return { ok: false, error: "Write the shared recap before publishing." };
  return patchMeeting(meetingId, {
    shared_published_at: publish ? new Date().toISOString() : null,
  });
}

export async function coachArchiveMeeting(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, { archived_at: new Date().toISOString() });
}
