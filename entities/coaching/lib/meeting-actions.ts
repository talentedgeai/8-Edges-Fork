"use server";

import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  assertCoachOwnsMeeting,
  coachArchiveMeeting,
  coachCreateOneOnOne,
  coachPublishSharedRecap,
  coachSaveSummaries,
  coachSaveTranscript,
  coachSkipOneOnOne,
} from "./data/one-on-ones";
import { assertCoachOwnsProfile } from "./data/shared";
import { generatePrep, summarizeMeeting } from "./ai";
import { parseInput, zDay, zId, zMarkdown, zLooseText } from "./schemas";
import { z } from "zod";
import type { Result } from "@/kernel/data/result";
import { refreshCoachAndDirectory } from "./revalidate";

// The shapes this file accepts. A transcript and a recap are the only things
// here that are genuinely long, so they get the markdown cap rather than a
// prose one; everything else is an id, a day or a boolean.
const S = {
  schedule: z.object({ profileId: zId, date: zDay }),
  log: z.object({ profileId: zId, date: zDay, transcript: zMarkdown }),
  transcript: z.object({ meetingId: zId, transcript: zMarkdown }),
  skip: z.object({ meetingId: zId, reason: zLooseText(1_000) }),
  meeting: z.object({ meetingId: zId }),
  summaries: z.object({ meetingId: zId, summaryMarkdown: zMarkdown, sharedSummaryMarkdown: zMarkdown }),
  publish: z.object({ meetingId: zId, publish: z.boolean() }),
};

// The coach's actions about MEETINGS: booking one, logging one that already
// happened, the transcript, the two summaries, publishing the shared recap,
// skipping and archiving.
//
// Split out of actions.ts (ticket 13), which had grown to thirty-two actions
// across seven concerns in under four hundred lines and could not take the
// input parsing without breaking the file-size cap. Meetings and commitments
// were the two coherent halves; what stayed is the person and their record.
//
// Same discipline as before: requireTeamMember() first — check-action-auth
// enforces that — then the parse, then a data helper that re-derives coach
// ownership server-side, so a forged id belonging to someone else's report is
// a no-op rather than a leak. The AI calls additionally assert ownership HERE
// before invoking the generator, because the generators are authorization-free
// (the cron calls them too).


// Book the next 1-1 (a scheduled row + the profile's next date).
export async function scheduleOneOnOne(profileId: string, date: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.schedule, { profileId, date });
  if (!p.ok) return p;
  const res = await coachCreateOneOnOne(actor, p.data.profileId, p.data.date, "scheduled");
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res.ok ? { ok: true } : res;
}

// Log a 1-1 that already happened. With a transcript, the AI summary runs
// inline (the coach lands on the drafted summaries when the page refreshes).
export async function logOneOnOne(
  profileId: string,
  date: string,
  transcript: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.log, { profileId, date, transcript });
  if (!p.ok) return p;
  const created = await coachCreateOneOnOne(actor, p.data.profileId, p.data.date, "held");
  if (!created.ok) return created;
  const text = p.data.transcript.trim();
  if (text) {
    const saved = await coachSaveTranscript(actor, created.id, text);
    if (!saved.ok) return saved;
    await summarizeMeeting(created.id); // fail-soft: ai_error lands on the row
  }
  refreshCoachAndDirectory(profileId);
  return { ok: true };
}

export async function saveTranscript(meetingId: string, transcript: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.transcript, { meetingId, transcript });
  if (!p.ok) return p;
  const res = await coachSaveTranscript(actor, p.data.meetingId, p.data.transcript);
  if (!res.ok) return res;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  await summarizeMeeting(meetingId);
  refreshCoachAndDirectory(owned?.profileId);
  return { ok: true };
}

// Skip a 1-1 with a reason; the cadence rolls forward behind it (K.9).
export async function skipOneOnOne(meetingId: string, reason: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.skip, { meetingId, reason });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachSkipOneOnOne(actor, p.data.meetingId, p.data.reason);
  if (res.ok) refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function generatePrepAction(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await generatePrep(p.data.meetingId);
  refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function summarizeAction(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await summarizeMeeting(p.data.meetingId);
  refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function saveSummaries(
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.summaries, { meetingId, summaryMarkdown, sharedSummaryMarkdown });
  if (!p.ok) return p;
  const res = await coachSaveSummaries(
    actor,
    p.data.meetingId,
    p.data.summaryMarkdown,
    p.data.sharedSummaryMarkdown,
  );
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refreshCoachAndDirectory(owned?.profileId);
  }
  return res;
}

export async function publishRecap(meetingId: string, publish: boolean): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.publish, { meetingId, publish });
  if (!p.ok) return p;
  const res = await coachPublishSharedRecap(actor, p.data.meetingId, p.data.publish);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refreshCoachAndDirectory(owned?.profileId);
  }
  return res;
}

export async function archiveMeeting(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  const res = await coachArchiveMeeting(actor, p.data.meetingId);
  if (res.ok) refreshCoachAndDirectory(owned?.profileId);
  return res;
}
