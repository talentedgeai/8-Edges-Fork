import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { addDays } from "@/kernel/config/dates";
import { rollForward } from "../cadence";
import { currentCycleCheckin } from "../types";
import { buildWrittenRecap, writtenOutcome } from "../written";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { patchMeeting, patchProfile, type Result } from "./shared";

// Hold a 1-1 in writing (K.35): the member's pre-meeting answers plus the
// coach's reply on the same check-in row count as the meeting. The row is
// marked held with held_source written, the exchange becomes the published
// shared recap, the miss and the voltage note are cleared, and the next date
// rolls exactly as it does after a skip. Coach tier: ownership is re-derived
// from the actor before anything is written.
export async function coachHoldInWriting(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };

  const { data: profile, error: profileError } = await companyOs
    .from("coaching_profiles")
    .select("cadence_days, next_one_on_one_on, preferred_weekday")
    .eq("id", owned.profileId)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, error: "Could not load the coaching profile." };
  const p = profile as { cadence_days: number | null; next_one_on_one_on: string | null; preferred_weekday: number | null };

  const { data: held, error: heldError } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on")
    .eq("coaching_profile_id", owned.profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .order("held_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (heldError) return { ok: false, error: "Could not load the 1-1s." };
  const lastHeldOn = (held as { held_on: string } | null)?.held_on ?? null;

  const { data: rows, error: rowsError } = await companyOs
    .from("coaching_checkins")
    .select("id, sent_at, moved_md, stuck_md, talk_md, coach_note_md")
    .eq("coaching_profile_id", owned.profileId)
    .order("sent_at", { ascending: false });
  if (rowsError) return { ok: false, error: "Could not load the form." };
  type Row = { id: string; sent_at: string; moved_md: string | null; stuck_md: string | null; talk_md: string | null; coach_note_md: string | null };
  const current = currentCycleCheckin(
    ((rows ?? []) as Row[]).map((r) => ({ ...r, sentAt: r.sent_at })),
    lastHeldOn,
    owned.meeting.heldOn,
  );
  const answers = current ? { moved: current.moved_md, stuck: current.stuck_md, talk: current.talk_md } : null;
  const allowed = writtenOutcome({ status: owned.meeting.status, answers, reply: current?.coach_note_md ?? null });
  if (!allowed.ok) return allowed;

  const recap = buildWrittenRecap(answers!, current!.coach_note_md!, actor.displayName);
  const patched = await patchMeeting(meetingId, {
    status: "held",
    held_source: "written",
    shared_summary_markdown: recap,
    shared_published_at: new Date().toISOString(),
    missed_at: null,
    coach_voltage_md: null,
  });
  if (!patched.ok) return patched;

  // The next date rolls as it does after a skip: only when it was this
  // meeting's date, anchored one day after so at least one step is taken.
  const heldOn = owned.meeting.heldOn;
  if (p.next_one_on_one_on && p.next_one_on_one_on > heldOn) return { ok: true };
  const rolled = rollForward(heldOn, null, p.cadence_days ?? 14, addDays(heldOn, 1), p.preferred_weekday);
  if (!rolled) return { ok: true };
  return patchProfile(owned.profileId, { next_one_on_one_on: rolled });
}
