"use server";

// The manual "attach Lark Minutes" pair (K.10). They live beside actions.ts
// rather than in it because that file is at its 400-line cap; same discipline
// applies — requireTeamMember() first, then the ownership assertion in
// data/one-on-ones.ts, which re-derives coach ownership server-side.

import { refreshCoaching } from "./revalidate";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { assertCoachOwnsMeeting, coachAttachMinutes } from "./data/one-on-ones";
import { summarizeMeeting } from "./ai";
import { listRecentMinutes } from "@/kernel/messaging/lark-api";
import type { Result } from "@/kernel/data/result";

import { parseInput, zId, zText } from "./schemas";
import { z } from "zod";

// What attaching minutes accepts (ticket 13). The token comes from a link the
// coach pasted, so it is text rather than a uuid.
const S = { attach: z.object({ meetingId: zId, token: zText(500, "Pick a set of minutes.") }) };

// The coach's own recent Lark Minutes, for the picker. Fourteen days is the
// window a 1-1 is realistically attached within, and the list is fail-soft: a
// tenant app without the Minutes scope gets [] and the paste-a-link fallback
// stays on screen.
export async function listRecentMinutesForCoach(): Promise<
  { token: string; title: string | null; startTime: string | null }[]
> {
  await requireTeamMember();
  return listRecentMinutes(14);
}

// Attach one of those recordings to a meeting and pull its transcript. The
// summary runs afterwards and fail-soft, exactly as the paste flow does: a
// stored transcript must not be lost to a model error.
export async function attachMinutes(meetingId: string, token: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.attach, { meetingId, token });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachAttachMinutes(actor, meetingId, token);
  if (res.ok) await summarizeMeeting(meetingId);
  refreshCoaching({ coachList: true, profileId: owned.profileId });
  return res;
}
