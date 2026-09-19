import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { saveCoachingTranscript } from "@/entities/coaching/lib/transcript";
import { fetchMinutesTranscript } from "@/kernel/messaging/lark-api";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { rollForward, validateProposedDate } from "@/entities/coaching/lib/cadence";
import { one } from "@/kernel/config/embedded";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyBoth } from "@/entities/coaching/lib/cycle-shared";
import { OPEN_COMMITMENT_STATUSES, type OneOnOneStatus } from "../types";
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
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return { ok: false, error: "Not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Bad date." };
  if (status !== "scheduled" && status !== "held") return { ok: false, error: "Bad status." };
  // The member's preferred time rides onto every row booked from here (K.34);
  // a logged past meeting gets none, since nobody recorded when it started.
  const startsAt = status === "scheduled" ? ((profile.preferred_time as string | null) ?? null) : null;

  // One live row per profile and date (a partial unique index enforces it).
  // A row already on that date is the meeting the coach means: the cron
  // scheduled it, and "log it as held" marks it held rather than inserting a
  // twin the index would reject anyway.
  const live = await liveScheduledRowOn(profileId, heldOn);

  let id: string;
  if (live) {
    if (status === "held" && live.status !== "held") {
      const { error } = await companyOs
        .from("coaching_one_on_ones")
        .update({ status: "held", coach_voltage_md: null, updated_at: new Date().toISOString() })
        .eq("id", live.id);
      if (error) return { ok: false, error: "Could not update the 1-1." };
    }
    id = live.id;
  } else {
    const { data, error } = await companyOs
      .from("coaching_one_on_ones")
      .insert({ coaching_profile_id: profileId, held_on: heldOn, status, starts_at: startsAt })
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Could not create the 1-1." };
    id = (data as { id: string }).id;
  }
  if (status === "scheduled") await patchProfile(profileId, { next_one_on_one_on: heldOn });
  return { ok: true, id };
}

// Meeting-scoped ownership: the meeting must belong to a profile this actor
// coaches. Returns { meeting, profileId } or null.
export async function assertCoachOwnsMeeting(
  actor: TeamActor,
  meetingId: string,
): Promise<{ meeting: OneOnOne; profileId: string } | null> {
  if (!meetingId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_one_on_ones")
    .select(`${MEETING_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", meetingId)
    .is("archived_at", null)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/one-on-ones] coaching_one_on_ones", dataError);
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
  return patchMeeting(meetingId, { status: "held", coach_voltage_md: null });
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
  const res = await patchMeeting(meetingId, {
    shared_published_at: publish ? new Date().toISOString() : null,
  });
  // The notification goes out after the publish has landed, and its failure is
  // never the publisher's problem (K.7, kept in K.15): the recap is visible on
  // the page either way, and a coach who clicked publish should not see an
  // error because Lark was down. Link only since K.15 (spec 4): no card, no
  // buttons, one line and the page.
  if (res.ok && publish) {
    try {
      await notifyRecapPublished(meetingId, owned.profileId, owned.meeting.heldOn);
    } catch (err) {
      console.error("[team/coaching/one-on-ones] recap notification", err instanceof Error ? err.message : err);
    }
  }
  return res;
}

// One plain message to the member when a recap is published: who, when, how
// many commitments are theirs to word, and the link. The count is the only
// number in it, and it counts commitments, never the person.
export async function notifyRecapPublished(
  meetingId: string,
  profileId: string,
  heldOn: string,
): Promise<boolean> {
  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select(
      "coach_id, team_members:team_members!team_member_id(people:people!person_id(full_name, preferred_name, email))",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_profiles", error);
    return false;
  }
  if (!data) return false;
  const r = data as unknown as Record<string, unknown>;
  const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const member = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const memberEmail = member?.email ?? null;
  if (!memberEmail) return false;

  const coachId = (r.coach_id as string | null) ?? null;
  let coachName = "Your coach";
  if (coachId) {
    const { data: coachRow, error: coachError } = await companyOs
      .from("team_members")
      .select("people:people!person_id(full_name, preferred_name, email)")
      .eq("id", coachId)
      .maybeSingle();
    if (coachError) console.error("[team/coaching/one-on-ones] team_members", coachError);
    const coach = one(
      ((coachRow as unknown as Record<string, unknown> | null)?.people ?? null) as PersonEmbed | PersonEmbed[] | null,
    );
    coachName = coach?.preferred_name || coach?.full_name || coachName;
  }

  const { count, error: countError } = await companyOs
    .from("coaching_commitments")
    .select("id", { count: "exact", head: true })
    .eq("coaching_profile_id", profileId)
    .eq("one_on_one_id", meetingId)
    .eq("owner", "member")
    .in("status", OPEN_COMMITMENT_STATUSES);
  if (countError) console.error("[team/coaching/one-on-ones] coaching_commitments", countError);
  const n = count ?? 0;

  const link = `${getSiteOrigin()}/team/my-coaching`;
  const text = `${coachName} published the recap of your 1-1 on ${heldOn}. ${n} commitment${n === 1 ? " is" : "s are"} yours to word.`;
  return notifyBoth({
    email: memberEmail,
    subject: `Your 1-1 recap (${heldOn})`,
    html: `<p>${text}</p><p><a href="${link}">Your coaching page</a></p>`,
    larkText: `${text} ${link}`,
    logKind: "recap_published",
  });
}

type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
};

// Skip a 1-1 with a reason (K.9). A skipped week is a fact about the rhythm,
// not an absence of one: the row stays in the log carrying why, and the
// profile's next date rolls forward by the cadence from the skipped date, so
// the coach does not have to rebook by hand. Anchoring the roll one day after
// the skipped date is what guarantees at least one step, whether the skip
// happens before or after the meeting was due.
export async function coachSkipOneOnOne(
  actor: TeamActor,
  meetingId: string,
  reason: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const text = reason.trim();
  if (!text) return { ok: false, error: "Say why it was skipped." };
  if (text.length > 500) return { ok: false, error: "Keep the reason to a line." };
  const patched = await patchMeeting(meetingId, { status: "skipped", skip_reason: text });
  if (!patched.ok) return patched;

  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("cadence_days, next_one_on_one_on, preferred_weekday")
    .eq("id", owned.profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_profiles", error);
    return { ok: true };
  }
  const profile = data as { cadence_days: number | null; next_one_on_one_on: string | null; preferred_weekday: number | null } | null;
  if (!profile) return { ok: true };
  const skipped = owned.meeting.heldOn;
  // Only a next date that is the skipped meeting itself needs moving; a date
  // already pointing past it is the coach's own booking.
  const current = profile.next_one_on_one_on;
  if (current && current > skipped) return { ok: true };
  const rolled = rollForward(skipped, null, profile.cadence_days ?? 14, addDays(skipped, 1), profile.preferred_weekday);
  if (!rolled) return { ok: true };
  return patchProfile(owned.profileId, { next_one_on_one_on: rolled });
}

// Move a 1-1 instead of skipping it (K.33). Skip says the cycle did not
// happen; a move says the same meeting is on another day, so the row survives
// with its id, and everything hung off that id — the prep, the member's
// pre-meeting answers, the commitments made against it — survives with it.
// The whole refusal rule is pure, so it reads and tests without a database.
export function moveOutcome(
  meeting: { status: OneOnOneStatus; heldOn: string },
  newDateISO: string,
  reason: string,
  todayISO: string,
): Result {
  // A meeting that happened is history; a skipped one is a cycle that did not
  // happen. Neither is a thing you reschedule — the coach books a new one.
  if (meeting.status === "held") return { ok: false, error: "A 1-1 that was held cannot be moved." };
  if (meeting.status === "skipped") return { ok: false, error: "A skipped 1-1 cannot be moved. Book the next one." };
  const valid = validateProposedDate(newDateISO, todayISO);
  if (!valid.ok) return valid;
  if (newDateISO === meeting.heldOn) return { ok: false, error: "That is the day it is already on." };
  const text = reason.trim();
  if (!text) return { ok: false, error: "Say why it moved." };
  if (text.length > 500) return { ok: false, error: "Keep the reason to a line." };
  return { ok: true };
}

// The live (not archived) 1-1 sitting on a date, if there is one. A partial
// unique index allows only one, which is why a move onto an occupied date has
// to be refused rather than attempted.
export async function liveScheduledRowOn(
  profileId: string,
  dateISO: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, status")
    .eq("coaching_profile_id", profileId)
    .eq("held_on", dateISO)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_one_on_ones", error);
    return null;
  }
  return (data as { id: string; status: string } | null) ?? null;
}

export async function coachMoveOneOnOne(
  actor: TeamActor,
  meetingId: string,
  newDateISO: string,
  reason: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const allowed = moveOutcome(owned.meeting, newDateISO, reason, saigonToday());
  if (!allowed.ok) return allowed;

  const occupied = await liveScheduledRowOn(owned.profileId, newDateISO);
  if (occupied && occupied.id !== meetingId)
    return { ok: false, error: "There is already a 1-1 on that day." };

  const from = owned.meeting.heldOn;
  // starts_at is deliberately left alone: the member's preferred time is a
  // property of the person, not of the day the meeting landed on.
  const patched = await patchMeeting(meetingId, {
    held_on: newDateISO,
    moved_from: from,
    move_reason: reason.trim(),
    // A move answers the miss: the meeting is on a new day and has not been
    // missed yet, so the prompt goes away on both pages (K.36).
    missed_at: null,
  });
  if (!patched.ok) return patched;

  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("next_one_on_one_on")
    .eq("id", owned.profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_profiles", error);
    return { ok: true };
  }
  // Only a next date that IS this meeting follows it; a date pointing at some
  // other row is that row's, and moving this one says nothing about it.
  const next = (data as { next_one_on_one_on: string | null } | null)?.next_one_on_one_on ?? null;
  if (next !== from) return { ok: true };
  return patchProfile(owned.profileId, { next_one_on_one_on: newDateISO });
}

// Attach a Lark Minutes recording the coach picked by hand, for the meetings
// the title heuristic never matched (K.10). Same end state as a pasted link
// plus the transcript pull, so the caller only has to summarize afterwards.
export async function coachAttachMinutes(
  actor: TeamActor,
  meetingId: string,
  token: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (!/^[a-z0-9_-]{4,128}$/i.test(token)) return { ok: false, error: "Pick a recording first." };
  const patched = await patchMeeting(meetingId, {
    minutes_token: token,
    transcript_source: "minutes_link",
  });
  if (!patched.ok) return patched;
  const transcript = await fetchMinutesTranscript(token);
  if (!transcript) return { ok: false, error: "Linked, but Lark returned no transcript yet. Try again later." };
  const saved = await saveCoachingTranscript(meetingId, transcript);
  if (!saved.ok) return saved;
  return patchMeeting(meetingId, { status: "held", coach_voltage_md: null });
}

export async function coachArchiveMeeting(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, { archived_at: new Date().toISOString() });
}

// Mark a missed 1-1 as held after the fact (K.36). One of the four ways out of
// the prompt: the meeting did happen, just not where the cron could see it, so
// the row goes to held and the cycle's clock picks it up on the next pass.
//
// missed_at is deliberately left on the row. "It did not happen on the day it
// was booked" stays true, and it is what the member's History shows; clearing
// it would rewrite the record to say the rhythm never slipped.
export async function coachMarkOneOnOneHeld(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (owned.meeting.status === "held") return { ok: true };
  if (owned.meeting.status === "skipped")
    return { ok: false, error: "A skipped 1-1 cannot be marked held. Book the next one." };
  return patchMeeting(meetingId, { status: "held", coach_voltage_md: null });
}

// The coach's voltage note (K.23): one private line before the meeting, theirs
// alone. It is cleared by every path that marks the row held, so nothing about
// the coach's state outlives the hour, and no member-tier read ever selects it.
export async function coachSaveVoltage(actor: TeamActor, meetingId: string, text: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (owned.meeting.status === "held") return { ok: false, error: "That 1-1 has been held." };
  const line = text.trim();
  if (line.length > 200) return { ok: false, error: "Keep it to a line." };
  return patchMeeting(meetingId, { coach_voltage_md: line || null });
}
