import type { TeamActor } from "@/kernel/identity/team-auth";
import { myProfileId } from "./member";
import { patchProfile, type Result } from "./shared";

// The member's preferred weekday and time for 1-1s (K.34). The member states
// it on their own page; the coach reads it; the cycle lands rolled dates on
// the weekday and copies the time onto each scheduled row. Member tier: the
// profile is always the actor's own, never a client-supplied id.

export type PreferredSlot = { weekday: number | null; time: string | null };

// Weekdays only: the roll-forward already refuses weekends, and offering
// Saturday would let the two disagree. The time is "HH:MM" on a 24-hour clock.
export function validatePreferredSlot(input: { weekday: number | null; time: string | null }): Result {
  if (input.weekday !== null && (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 5))
    return { ok: false, error: "Pick a weekday, Monday to Friday." };
  if (input.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    return { ok: false, error: "Give the time as HH:MM." };
  return { ok: true };
}

export async function saveMyPreferredSlot(actor: TeamActor, input: PreferredSlot): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validatePreferredSlot(input);
  if (!valid.ok) return valid;
  return patchProfile(profileId, { preferred_weekday: input.weekday, preferred_time: input.time });
}
