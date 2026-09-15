import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { selectTasks, selectBoardMembers, selectBoardColumns, selectBoards, listActiveBoards, SUBJECT_COMMITMENT } from "@/entities/boards";
import { type LadderInput } from "../types";
import { MEMBER_EMBED } from "./rows";

// Boards a coach may push a commitment to: their own memberships (admins: all).
// Scoped so the picker never exposes unrelated client boards.
export async function coachBoards(actor: TeamActor): Promise<{ id: string; slug: string; name: string }[]> {
  if (actor.isAdmin) return listActiveBoards();
  const { data: mem, error: memError } = await selectBoardMembers("board_id")
    .eq("person_id", actor.personId);
  if (memError) console.error("[team/coaching/shared] board_members", memError);
  const ids = ((mem ?? []) as { board_id: string }[]).map((m) => m.board_id);
  if (ids.length === 0) return [];
  const { data, error: dataError } = await selectBoards("id, slug, name")
    .in("id", ids)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  if (dataError) console.error("[team/coaching/shared] boards", dataError);
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

// A pushed commitment's board card, for the inline "on the board" status.
export type CommitmentCard = {
  boardSlug: string;
  boardName: string;
  columnName: string;
  done: boolean;
};

export async function loadCommitmentCards(ids: string[]): Promise<Record<string, CommitmentCard>> {
  if (ids.length === 0) return {};
  const { data, error: dataError } = await selectTasks("subject_id, board_id, board_column_id, status")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .in("subject_id", ids)
    .is("archived_at", null);
  if (dataError) console.error("[team/coaching/shared] tasks", dataError);
  const rows = (data ?? []) as {
    subject_id: string;
    board_id: string;
    board_column_id: string | null;
    status: string;
  }[];
  if (rows.length === 0) return {};
  const boardIds = [...new Set(rows.map((r) => r.board_id))];
  const colIds = [...new Set(rows.map((r) => r.board_column_id).filter(Boolean) as string[])];
  const [boardsRes, colsRes] = await Promise.all([
    selectBoards("id, slug, name").in("id", boardIds),
    colIds.length
      ? selectBoardColumns("id, name").in("id", colIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const bmap = new Map((boardsRes.data ?? []).map((b) => [b.id, b as { id: string; slug: string; name: string }]));
  const cmap = new Map((colsRes.data ?? []).map((c) => [c.id, (c as { id: string; name: string }).name]));
  const out: Record<string, CommitmentCard> = {};
  for (const r of rows) {
    const b = bmap.get(r.board_id);
    if (!b) continue;
    out[r.subject_id] = {
      boardSlug: b.slug,
      boardName: b.name,
      columnName: r.board_column_id ? cmap.get(r.board_column_id) ?? "" : "",
      done: r.status === "done",
    };
  }
  return out;
}

// (getEdgesLadderOptions below is also consumed by lib/coaching/ai.ts to give
// the generators live goal-ladder context.)

export const PROFILE_SELECT =
  "id, team_member_id, coach_id, " +
  "private_profile_markdown, cadence_days, next_one_on_one_on, one_on_ones_paused_at, retention_root, active, " +
  MEMBER_EMBED;

export type ModeSplit = { coach: number; mentor: number; direct: number };

// Ownership assertion for every coach-side read/write that takes a profile id
// from the client. Returns the raw profile row iff the actor is its coach.
export async function assertCoachOwnsProfile(
  actor: TeamActor,
  profileId: string,
): Promise<Record<string, unknown> | null> {
  if (!profileId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select(PROFILE_SELECT)
    .eq("id", profileId)
    .eq("coach_id", actor.teamMemberId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/shared] coaching_profiles", dataError);
  return (data as unknown as Record<string, unknown>) ?? null;
}

export type Result = { ok: true } | { ok: false; error: string };

export async function patchProfile(profileId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}

export async function patchMeeting(meetingId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_one_on_ones")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}

export function ladderColumns(ladder: LadderInput): { objective_id: string | null; key_result_id: string | null } {
  return {
    objective_id: ladder.kind === "objective" ? ladder.id : null,
    key_result_id: ladder.kind === "key_result" ? ladder.id : null,
  };
}

// Goal mutations are open to the profile's coach AND to any manager: managers
// can add, edit, or delete a FAST goal for any team member (Dave, 2026-08-11).
export async function canManageGoals(actor: TeamActor, profileId: string): Promise<boolean> {
  if (!profileId) return false;
  if (actor.role === "manager") {
    const { data, error: dataError } = await companyOs
      .from("coaching_profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    if (dataError) console.error("[team/coaching/shared] coaching_profiles", dataError);
    return Boolean(data);
  }
  return Boolean(await assertCoachOwnsProfile(actor, profileId));
}

export async function goalProfileId(goalId: string): Promise<string | null> {
  if (!goalId) return null;
  const { data, error: dataError } = await companyOs
    .from("goals")
    .select("coaching_profile_id")
    .eq("id", goalId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/shared] goals", dataError);
  return (data as { coaching_profile_id: string } | null)?.coaching_profile_id ?? null;
}

// The active coaching profile behind a team member, for surfaces (directory)
// that manage goals without being on the coach page.
export async function getCoachingProfileIdForMember(teamMemberId: string): Promise<string | null> {
  if (!teamMemberId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/shared] coaching_profiles", dataError);
  return (data as { id: string } | null)?.id ?? null;
}
