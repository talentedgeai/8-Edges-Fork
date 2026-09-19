"use server";

import { requireTeamMember } from "@/kernel/identity/team-auth";
import { assertCoachOwnsMeeting, coachMarkOneOnOneHeld, coachMoveOneOnOne, coachSaveVoltage } from "./data/one-on-ones";
import { coachConfirmProposedDate, coachDeclineProposedDate } from "./data/proposals";
import { coachHoldInWriting } from "./data/written";
import type { Result } from "@/kernel/data/result";

import { parseInput, zDay, zId, zLooseText } from "./schemas";
import { z } from "zod";
import { refreshCoachAndMember, refreshCoaching } from "./revalidate";

// What a scheduling action accepts (ticket 13).
const S = {
  profile: z.object({ profileId: zId }),
  meeting: z.object({ meetingId: zId }),
  move: z.object({ meetingId: zId, newDate: zDay, reason: zLooseText(1_000) }),
  voltage: z.object({ meetingId: zId, text: zLooseText(5_000) }),
};

// The coach's scheduling actions (K.32, K.33, K.36): confirm or decline a date
// the member proposed, move a 1-1, mark a missed one held. Split out of
// actions.ts for the file-size cap. Every one starts with the guard and
// re-derives ownership server-side, like the rest of the coach tier. Both the
// coach's profile page and the member's My Coach show the date, so both are
// refreshed.


// The coach's one click on a date the member proposed (K.32): confirm writes
// next_one_on_one_on and the scheduled row, decline clears the proposal and
// leaves the date already on the profile standing.
export async function confirmProposedDate(profileId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const res = await coachConfirmProposedDate(actor, p.data.profileId);
  if (res.ok) refreshCoachAndMember(profileId);
  return res;
}

export async function declineProposedDate(profileId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const res = await coachDeclineProposedDate(actor, p.data.profileId);
  if (res.ok) refreshCoachAndMember(profileId);
  return res;
}

// Move a 1-1 rather than skip it (K.33). Both the coach's profile page and
// the member's My Coach show the date, so both are refreshed.
export async function moveOneOnOne(meetingId: string, newDate: string, reason: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.move, { meetingId, newDate, reason });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachMoveOneOnOne(actor, meetingId, newDate, reason);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}

// Mark a missed 1-1 as held after the fact (K.36): the meeting happened, the
// cron just never saw it. The member's page reads the same row, so both are
// refreshed.
export async function markOneOnOneHeld(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachMarkOneOnOneHeld(actor, meetingId);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}


// The coach's voltage note (K.23). Only the coach's page shows it, so only
// that page is refreshed.
export async function saveVoltageNote(meetingId: string, text: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.voltage, { meetingId, text });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachSaveVoltage(actor, meetingId, text);
  if (res.ok) refreshCoaching({ profileId: owned.profileId });
  return res;
}

// Hold a 1-1 in writing (K.35): the answers plus the reply count as the
// meeting. Both pages show the row and the next date, so both are refreshed.
export async function holdOneOnOneInWriting(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachHoldInWriting(actor, meetingId);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}
