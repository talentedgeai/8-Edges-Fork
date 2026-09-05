"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  myAddCommitment,
  myAddTalkingPoint,
  myDeleteCommitment,
  myDeleteTalkingPoint,
  myReorderCommitments,
  myUpdateCommitmentDetails,
  myUpdateCommitmentStatus,
  type CommitmentStatus,
} from "@/entities/team/modules/coaching";

// Member-side commitment actions. Every one re-derives ownership server-side
// from the JWT actor; the commitment id is the only client input trusted, and
// only after it is proven to sit on the actor's own profile.
//
// Status and order are open to the member on ANY commitment on their profile,
// including what their coach set. Title, due date, and deletion are limited to
// what the member wrote themselves (created_by).

type Result = { ok: true } | { ok: false; error: string };

const done = (res: Result): Result => {
  if (res.ok) revalidatePath("/team/my-coaching");
  return res;
};

export async function updateMyCommitment(
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myUpdateCommitmentStatus(actor, commitmentId, status, note));
}

export async function addMyCommitment(title: string, dueOn: string | null): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myAddCommitment(actor, { title, dueOn }));
}

export async function editMyCommitment(
  commitmentId: string,
  title: string,
  dueOn: string | null,
): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myUpdateCommitmentDetails(actor, commitmentId, { title, dueOn }));
}

export async function deleteMyCommitment(commitmentId: string): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myDeleteCommitment(actor, commitmentId));
}

export async function reorderMyCommitments(orderedIds: string[]): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myReorderCommitments(actor, orderedIds));
}

// Talking points: the member's half of the 1-1 agenda.
export async function addMyTalkingPoint(body: string): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myAddTalkingPoint(actor, body));
}

export async function deleteMyTalkingPoint(id: string): Promise<Result> {
  const actor = await requireTeamMember();
  return done(await myDeleteTalkingPoint(actor, id));
}
