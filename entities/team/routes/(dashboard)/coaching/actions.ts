"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  assertCoachOwnsMeeting,
  assertCoachOwnsProfile,
  coachAddCommitment,
  coachPushCommitmentToBoard,
  coachAddGoal,
  coachAddPriority,
  coachAddToRoster,
  addGoalComment,
  coachArchiveMeeting,
  coachCreateOneOnOne,
  coachPublishOcean,
  coachPublishSharedRecap,
  coachReorderCommitments,
  coachSaveOcean,
  coachSaveSummaries,
  coachSaveTranscript,
  coachSetCadence,
  coachSetMinutesLink,
  coachSetPrivateProfile,
  coachSetRetentionRoot,
  coachDeleteGoal,
  coachUpdateCommitment,
  coachUpdateGoal,
  coachUpdatePriority,
  setTalkingPointAddressed,
  type CommitmentOwner,
  type CommitmentStatus,
  type GoalStatus,
  type LadderInput,
  type OceanInput,
  type PriorityStatus,
  type RetentionRoot,
} from "@/entities/team/modules/coaching";
import { generatePrep, generateTrendReport, summarizeMeeting } from "@/entities/team/modules/coaching/ai";
import { notifyBoardAssignee } from "@/entities/company-os";

// Coach-side actions for /team/coaching. Same discipline as the onboarding
// actions: requireTeamMember() plus ownership assertions in lib/coaching/data
// — every helper re-derives coach ownership server-side, so a client-forged
// profile/meeting/commitment id belonging to someone else's report is a no-op.
// The AI calls (prep, summarize, trend) additionally assert ownership HERE
// before invoking the generator, because the generators themselves are
// authorization-free (the cron calls them too).

type Result = { ok: true } | { ok: false; error: string };

function refresh(profileId?: string) {
  revalidatePath("/team/coaching");
  if (profileId) revalidatePath(`/team/coaching/${profileId}`);
  // Goals also render on directory profiles (team-wide transparency).
  revalidatePath("/team/directory");
}

// Mark a talking point the member raised as addressed (it drops off both pages).
export async function resolveTalkingPoint(id: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await setTalkingPointAddressed(actor, id, true);
  if (res.ok) refresh(res.profileId);
  return res.ok ? { ok: true } : res;
}

// Comments on FAST goals: open to every team member (goals are transparent,
// so is the discussion). Revalidates all three surfaces that render them.
export async function commentOnGoal(goalId: string, body: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await addGoalComment(actor, goalId, body);
  if (res.ok) {
    revalidatePath("/team/coaching");
    revalidatePath("/team/my-coaching");
    revalidatePath("/team/directory");
  }
  return res;
}

export async function addToRoster(teamMemberId: string, firstOneOnOne: string | null): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachAddToRoster(actor, teamMemberId, firstOneOnOne);
  if (res.ok) refresh();
  return res;
}

export async function addGoal(
  profileId: string,
  title: string,
  status: GoalStatus,
  quarterLabel: string | null,
  ladder: LadderInput,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachAddGoal(actor, profileId, { title, status, quarterLabel, ladder });
  if (res.ok) refresh(profileId);
  return res;
}

export async function updateGoal(
  profileId: string,
  goalId: string,
  patch: { title?: string; status?: GoalStatus; quarterLabel?: string | null; ladder?: LadderInput },
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachUpdateGoal(actor, goalId, patch);
  if (res.ok) refresh(profileId);
  return res;
}

export async function deleteGoal(profileId: string, goalId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachDeleteGoal(actor, goalId);
  if (res.ok) refresh(profileId);
  return res;
}

export async function addPriority(
  profileId: string,
  title: string,
  detail: string,
  ladder: LadderInput,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachAddPriority(actor, profileId, { title, detail, ladder });
  if (res.ok) refresh(profileId);
  return res;
}

export async function updatePriority(
  profileId: string,
  priorityId: string,
  patch: { title?: string; detail?: string; status?: PriorityStatus; ladder?: LadderInput },
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachUpdatePriority(actor, priorityId, patch);
  if (res.ok) refresh(profileId);
  return res;
}

export async function saveOcean(profileId: string, input: OceanInput): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSaveOcean(actor, profileId, input);
  if (res.ok) refresh(profileId);
  return res;
}

export async function publishOcean(profileId: string, publish: boolean): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachPublishOcean(actor, profileId, publish);
  if (res.ok) refresh(profileId);
  return res;
}

export async function setRetentionRoot(profileId: string, root: RetentionRoot | null): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSetRetentionRoot(actor, profileId, root);
  if (res.ok) refresh(profileId);
  return res;
}

export async function setMinutesLink(meetingId: string, url: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSetMinutesLink(actor, meetingId, url);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refresh(owned?.profileId);
  }
  return res;
}

export async function setCadence(
  profileId: string,
  cadenceDays: number,
  nextOneOnOneOn: string | null,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSetCadence(actor, profileId, cadenceDays, nextOneOnOneOn);
  if (res.ok) refresh(profileId);
  return res;
}

export async function savePrivateProfile(profileId: string, markdown: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSetPrivateProfile(actor, profileId, markdown);
  if (res.ok) refresh(profileId);
  return res;
}

// Book the next 1-1 (a scheduled row + the profile's next date).
export async function scheduleOneOnOne(profileId: string, date: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachCreateOneOnOne(actor, profileId, date, "scheduled");
  if (res.ok) refresh(profileId);
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
  const created = await coachCreateOneOnOne(actor, profileId, date, "held");
  if (!created.ok) return created;
  const text = transcript.trim();
  if (text) {
    const saved = await coachSaveTranscript(actor, created.id, text);
    if (!saved.ok) return saved;
    await summarizeMeeting(created.id); // fail-soft: ai_error lands on the row
  }
  refresh(profileId);
  return { ok: true };
}

export async function saveTranscript(meetingId: string, transcript: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSaveTranscript(actor, meetingId, transcript);
  if (!res.ok) return res;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  await summarizeMeeting(meetingId);
  refresh(owned?.profileId);
  return { ok: true };
}

export async function generatePrepAction(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await generatePrep(meetingId);
  refresh(owned.profileId);
  return res;
}

export async function summarizeAction(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await summarizeMeeting(meetingId);
  refresh(owned.profileId);
  return res;
}

export async function saveSummaries(
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachSaveSummaries(actor, meetingId, summaryMarkdown, sharedSummaryMarkdown);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refresh(owned?.profileId);
  }
  return res;
}

export async function publishRecap(meetingId: string, publish: boolean): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachPublishSharedRecap(actor, meetingId, publish);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refresh(owned?.profileId);
  }
  return res;
}

export async function archiveMeeting(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  const res = await coachArchiveMeeting(actor, meetingId);
  if (res.ok) refresh(owned?.profileId);
  return res;
}

export async function addCommitment(
  profileId: string,
  title: string,
  owner: CommitmentOwner,
  dueOn: string | null,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachAddCommitment(actor, profileId, { title, owner, dueOn });
  if (res.ok) refresh(profileId);
  return res;
}

export async function updateCommitmentStatus(
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachUpdateCommitment(actor, commitmentId, { status, statusNote: note });
  if (res.ok) refresh();
  return res;
}

export async function pushCommitmentToBoard(
  commitmentId: string,
  boardId: string,
  profileId: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachPushCommitmentToBoard(actor, commitmentId, boardId);
  if (res.ok) {
    if (res.created) {
      await notifyBoardAssignee(boardId, res.created.assigneeId, res.created.title, actor.personId);
    }
    refresh(profileId);
  }
  return res;
}

// One shared priority stack: the member drags the same list from
// /team/my-coaching, so both pages agree on what matters most.
export async function reorderCommitments(
  profileId: string,
  orderedIds: string[],
): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await coachReorderCommitments(actor, profileId, orderedIds);
  if (res.ok) refresh(profileId);
  return res;
}

// Run (or re-run) the trend report for a month, e.g. "2026-07".
export async function runTrendReport(profileId: string): Promise<Result> {
  const actor = await requireTeamMember();
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const res = await generateTrendReport(profileId);
  refresh(profileId);
  return res;
}
