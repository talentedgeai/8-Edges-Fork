import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { saigonToday } from "@/kernel/config/dates";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyBoth } from "@/entities/coaching/lib/cycle-shared";
import { describeDay, validateProposedDate } from "../cadence";
import { myProfileId } from "./member";
import { toMember } from "./rows";
import { coachCreateOneOnOne, coachMoveOneOnOne, liveScheduledRowOn } from "./one-on-ones";
import { assertCoachOwnsProfile, patchProfile, type Result } from "./shared";

// The member picks or proposes the first 1-1 date (K.32). Two outcomes, and
// which one happens is a property of the profile, not of the member: with no
// date on the profile at all there is nothing to negotiate, so the proposal
// becomes the date at once; with a date already there — the coach's default,
// or one the cycle rolled — the member is asking to move it, and the coach
// confirms. The coach hears about it as one plain line with a link, never a
// card with buttons (spec 4, kept since K.15).

export type ProposalOutcome = "confirmed" | "proposed";

// Pure, and the whole of the auto-confirm rule, so it can be read and tested
// without a database.
export function proposalOutcome(profile: { hasNextDate: boolean }): ProposalOutcome {
  return profile.hasNextDate ? "proposed" : "confirmed";
}

// Member tier: the profile is always the actor's own, never a client-supplied
// id, exactly as the preferred slot is.
export async function proposeMyDate(actor: TeamActor, dateISO: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validateProposedDate(dateISO, saigonToday());
  if (!valid.ok) return valid;

  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("id, coach_id, next_one_on_one_on")
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/proposals] coaching_profiles", error);
    return { ok: false, error: "Could not save." };
  }
  const profile = data as { id: string; coach_id: string | null; next_one_on_one_on: string | null } | null;
  if (!profile) return { ok: false, error: "You are not in a coaching cycle." };

  if (proposalOutcome({ hasNextDate: Boolean(profile.next_one_on_one_on) }) === "confirmed") {
    const booked = await bookProposedDate(profileId, dateISO);
    if (!booked.ok) return booked;
    await tellTheCoach(profile.coach_id, actor.displayName, dateISO, "booked");
    return { ok: true };
  }

  const stored = await patchProfile(profileId, {
    proposed_one_on_one_on: dateISO,
    proposed_by: "member",
  });
  if (!stored.ok) return stored;
  await tellTheCoach(profile.coach_id, actor.displayName, dateISO, "proposed");
  return { ok: true };
}

// The scheduled row plus the profile's date, without the coach ownership check
// coachCreateOneOnOne applies — this path is the member's own profile, proven
// by myProfileId, and there is no coach actor to assert against.
async function bookProposedDate(profileId: string, dateISO: string): Promise<Result> {
  const { data: profile, error: profileError } = await companyOs
    .from("coaching_profiles")
    .select("preferred_time")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) {
    console.error("[team/coaching/proposals] coaching_profiles", profileError);
    return { ok: false, error: "Could not save." };
  }
  const startsAt = (profile as { preferred_time: string | null } | null)?.preferred_time ?? null;

  // One live row per profile and date (a partial unique index enforces it), so
  // a row already sitting on that date is the meeting this date means.
  const { data: existing, error: existingError } = await companyOs
    .from("coaching_one_on_ones")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .eq("held_on", dateISO)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) console.error("[team/coaching/proposals] coaching_one_on_ones", existingError);
  if (!existing) {
    const { error } = await companyOs
      .from("coaching_one_on_ones")
      .insert({ coaching_profile_id: profileId, held_on: dateISO, status: "scheduled", starts_at: startsAt });
    if (error) {
      console.error("[team/coaching/proposals] coaching_one_on_ones insert", error);
      return { ok: false, error: "Could not book the 1-1." };
    }
  }
  return patchProfile(profileId, {
    next_one_on_one_on: dateISO,
    proposed_one_on_one_on: null,
    proposed_by: null,
  });
}

type PersonEmbed = { full_name: string | null; preferred_name: string | null; email: string | null };

// One plain line to the coach plus the link to their roster. Never a card and
// never a button: the coach confirms on the page, which is also where they can
// see what else is on that day.
async function tellTheCoach(
  coachId: string | null,
  memberName: string,
  dateISO: string,
  kind: "booked" | "proposed",
): Promise<void> {
  if (!coachId) return;
  try {
    const { data, error } = await companyOs
      .from("team_members")
      .select("people:people!person_id(full_name, preferred_name, email)")
      .eq("id", coachId)
      .maybeSingle();
    if (error) {
      console.error("[team/coaching/proposals] team_members", error);
      return;
    }
    const coach = one(
      ((data as unknown as Record<string, unknown> | null)?.people ?? null) as PersonEmbed | PersonEmbed[] | null,
    );
    const email = coach?.email ?? null;
    if (!email) return;
    const when = describeDay(dateISO);
    const text =
      kind === "booked"
        ? `${memberName} booked their first 1-1 for ${when}.`
        : `${memberName} proposes ${when} for their next 1-1. Confirm it when it suits you.`;
    const link = `${getSiteOrigin()}/team/coaching`;
    await notifyBoth({
      email,
      subject: `1-1 date from ${memberName} (${dateISO})`,
      html: `<p>${text}</p><p><a href="${link}">Your coaching roster</a></p>`,
      larkText: `${text} ${link}`,
      logKind: kind === "booked" ? "one_on_one_booked" : "one_on_one_proposed",
    });
  } catch (err) {
    // The proposal has landed; a notification that fails is never the
    // member's problem, and the coach sees it on the page either way.
    console.error("[team/coaching/proposals] notify", err instanceof Error ? err.message : err);
  }
}

// Coach tier: both actions re-derive ownership from the actor before writing.
export async function coachConfirmProposedDate(actor: TeamActor, profileId: string): Promise<Result> {
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return { ok: false, error: "Not found." };
  const proposed = (profile.proposed_one_on_one_on as string | null) ?? null;
  if (!proposed) return { ok: false, error: "There is nothing to confirm." };

  // When a 1-1 is already booked on the current next date, the member was
  // asking to MOVE that meeting, not to have a second one (K.33): booking a
  // new row here would leave the first one behind with the prep and the
  // answers attached to it. Anything else — no row, or a row that was already
  // held or skipped — is a fresh booking.
  const current = (profile.next_one_on_one_on as string | null) ?? null;
  // Confirming the day it is already on is nothing but clearing the proposal.
  if (current === proposed) return patchProfile(profileId, { proposed_one_on_one_on: null, proposed_by: null });
  const live = current ? await liveScheduledRowOn(profileId, current) : null;
  const booked =
    live && live.status === "scheduled"
      ? await coachMoveOneOnOne(actor, live.id, proposed, `moved at ${toMember(profile).name}'s request`)
      : await coachCreateOneOnOne(actor, profileId, proposed, "scheduled");
  if (!booked.ok) return booked;
  return patchProfile(profileId, { proposed_one_on_one_on: null, proposed_by: null });
}

export async function coachDeclineProposedDate(actor: TeamActor, profileId: string): Promise<Result> {
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return { ok: false, error: "Not found." };
  // Declining clears the proposal and nothing else: the date already on the
  // profile stands, which is what the member was asking to change.
  return patchProfile(profileId, { proposed_one_on_one_on: null, proposed_by: null });
}
