import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { insertTasks, SUBJECT_COMMITMENT } from "@/entities/company-os";
import { COMMITMENT_STATUS_LABELS, type CommitmentOwner, type CommitmentStatus } from "../types";
import { COMMITMENT_SELECT } from "./rows";
import { assertCoachOwnsProfile, type Result } from "./shared";

export async function coachAddCommitment(
  actor: TeamActor,
  profileId: string,
  input: { title: string; owner: CommitmentOwner; dueOn: string | null; oneOnOneId?: string | null },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the commitment first." };
  if (title.length > 500) return { ok: false, error: "Keep the commitment under 500 characters." };
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) return { ok: false, error: "Bad date." };
  const owner: CommitmentOwner = input.owner === "coach" ? "coach" : "member";
  const { error } = await companyOs.from("coaching_commitments").insert({
    coaching_profile_id: profileId,
    one_on_one_id: input.oneOnOneId ?? null,
    title,
    owner,
    due_on: input.dueOn,
    created_by: actor.teamMemberId,
    sort_order: await nextCommitmentSort(profileId),
  });
  return error ? { ok: false, error: "Could not add the commitment." } : { ok: true };
}

// New commitments land at the bottom of the stack.
export async function nextCommitmentSort(profileId: string): Promise<number> {
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("sort_order")
    .eq("coaching_profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data as { sort_order: number | null } | null)?.sort_order;
  return typeof top === "number" ? top + 1 : 0;
}

// Rewrite the stack from a client-supplied id list. The ids are the ONLY thing
// taken from the client, and every one of them must already belong to this
// profile — an id from another profile fails the whole call rather than
// silently reordering someone else's commitments.
export async function applyCommitmentOrder(profileId: string, orderedIds: string[]): Promise<Result> {
  if (orderedIds.length === 0) return { ok: true };
  if (new Set(orderedIds).size !== orderedIds.length) return { ok: false, error: "Bad order." };
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .in("id", orderedIds);
  const mine = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  if (mine.size !== orderedIds.length) return { ok: false, error: "Not found." };
  const stamp = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      companyOs
        .from("coaching_commitments")
        .update({ sort_order: i, updated_at: stamp })
        .eq("id", id),
    ),
  );
  return results.some((r) => r.error) ? { ok: false, error: "Could not save the new order." } : { ok: true };
}

export async function coachReorderCommitments(
  actor: TeamActor,
  profileId: string,
  orderedIds: string[],
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return applyCommitmentOrder(profileId, orderedIds);
}

async function assertCoachOwnsCommitment(
  actor: TeamActor,
  commitmentId: string,
): Promise<Record<string, unknown> | null> {
  if (!commitmentId) return null;
  const { data } = await companyOs
    .from("coaching_commitments")
    .select(`${COMMITMENT_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", commitmentId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  return prof?.coach_id === actor.teamMemberId ? r : null;
}

export async function coachUpdateCommitment(
  actor: TeamActor,
  commitmentId: string,
  patch: { status?: CommitmentStatus; statusNote?: string; title?: string; dueOn?: string | null },
): Promise<Result> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The commitment needs a title." };
    update.title = t;
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn)) return { ok: false, error: "Bad date." };
    update.due_on = patch.dueOn;
  }
  if (patch.status !== undefined) {
    if (!(patch.status in COMMITMENT_STATUS_LABELS)) return { ok: false, error: "Bad status." };
    update.status = patch.status;
    update.status_updated_by = actor.teamMemberId;
    update.status_updated_at = new Date().toISOString();
    update.closed_at =
      patch.status === "completed" || patch.status === "dropped" ? new Date().toISOString() : null;
  }
  if (patch.statusNote !== undefined) update.status_note = patch.statusNote.trim() || null;
  const { error } = await companyOs.from("coaching_commitments").update(update).eq("id", commitmentId);
  return error ? { ok: false, error: "Could not update the commitment." } : { ok: true };
}

// Push a commitment onto a task board as a linked card. Idempotent: if a live
// card already links to this commitment, do nothing. Assignee is the coached
// person for a member commitment, the coach for a coach commitment.
export async function coachPushCommitmentToBoard(
  actor: TeamActor,
  commitmentId: string,
  boardId: string,
): Promise<Result & { created?: { assigneeId: string | null; title: string } }> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  if (!boardId) return { ok: false, error: "Pick a board." };
  // The board is the write boundary: only a member (or admin) may add a card,
  // exactly as every admin/team board mutation enforces. The actor is already
  // resolved here, so check membership directly (no session helper — this module
  // is reachable from client components and must not import next/headers).
  if (!actor.isAdmin) {
    const { data: mem } = await companyOs
      .from("board_members")
      .select("id")
      .eq("board_id", boardId)
      .eq("person_id", actor.personId)
      .maybeSingle();
    if (!mem) return { ok: false, error: "You are not a member of that board." };
  }

  const { data: existing } = await companyOs
    .from("tasks")
    .select("id")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .eq("subject_id", commitmentId)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return { ok: true };

  const { data: cols } = await companyOs
    .from("board_columns")
    .select("id, is_done, position")
    .eq("board_id", boardId)
    .order("position");
  const columns = (cols ?? []) as { id: string; is_done: boolean; position: number }[];
  if (columns.length === 0) return { ok: false, error: "That board has no columns." };
  const target = columns.find((c) => !c.is_done) ?? columns[0];

  const owner = row.owner as CommitmentOwner;
  const { data: prof } = await companyOs
    .from("coaching_profiles")
    .select("team_member_id, coach_id")
    .eq("id", row.coaching_profile_id as string)
    .maybeSingle();
  const p = prof as { team_member_id: string; coach_id: string } | null;
  const targetTm = owner === "coach" ? p?.coach_id : p?.team_member_id;
  let assigneeId: string | null = null;
  if (targetTm) {
    const { data: tm } = await companyOs.from("team_members").select("person_id").eq("id", targetTm).maybeSingle();
    assigneeId = (tm as { person_id: string } | null)?.person_id ?? null;
  }

  const { data: last } = await companyOs
    .from("tasks")
    .select("position")
    .eq("board_id", boardId)
    .eq("board_column_id", target.id)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? 0) + 1;

  const { error } = await insertTasks({
    board_id: boardId,
    board_column_id: target.id,
    title: row.title as string,
    assignee_id: assigneeId,
    due_date: (row.due_on as string | null) ?? null,
    priority: "p2",
    status: "open",
    subject_type: SUBJECT_COMMITMENT,
    subject_id: commitmentId,
    position,
  });
  if (error) return { ok: false, error: "Could not add the card." };
  return { ok: true, created: { assigneeId, title: row.title as string } };
}
