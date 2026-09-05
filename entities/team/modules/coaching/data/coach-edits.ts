import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { GOAL_STATUS_LABELS, RETENTION_ROOT_LABELS, OCEAN_DIMENSIONS, type OceanDimensionKey, type GoalStatus, type PriorityStatus, type RetentionRoot, type LadderInput } from "../types";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { assertCoachOwnsProfile, canManageGoals, goalProfileId, ladderColumns, patchMeeting, patchProfile, type Result } from "./shared";

export async function coachAddGoal(
  actor: TeamActor,
  profileId: string,
  input: { title: string; status: GoalStatus; quarterLabel: string | null; ladder: LadderInput },
): Promise<Result> {
  if (!(await canManageGoals(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the goal first." };
  if (!(input.status in GOAL_STATUS_LABELS)) return { ok: false, error: "Bad status." };
  const { error } = await companyOs.from("goals").insert({
    coaching_profile_id: profileId,
    created_by: actor.teamMemberId,
    title,
    status: input.status,
    quarter_label: input.quarterLabel?.trim() || null,
    ...ladderColumns(input.ladder),
  });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

async function assertCoachOwnsRow(
  actor: TeamActor,
  table: "goals" | "coaching_priorities",
  id: string,
): Promise<boolean> {
  if (!id) return false;
  const { data } = await companyOs
    .from(table)
    .select("id, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return false;
  const prof = one(
    (data as unknown as Record<string, unknown>).coaching_profiles as
      | { coach_id: string }
      | { coach_id: string }[]
      | null,
  );
  return prof?.coach_id === actor.teamMemberId;
}

export async function coachUpdateGoal(
  actor: TeamActor,
  goalId: string,
  patch: { title?: string; status?: GoalStatus; quarterLabel?: string | null; ladder?: LadderInput },
): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The goal needs a title." };
    update.title = t;
  }
  if (patch.status !== undefined) {
    if (!(patch.status in GOAL_STATUS_LABELS)) return { ok: false, error: "Bad status." };
    update.status = patch.status;
  }
  if (patch.quarterLabel !== undefined) update.quarter_label = patch.quarterLabel?.trim() || null;
  if (patch.ladder !== undefined) Object.assign(update, ladderColumns(patch.ladder));
  const { error } = await companyOs.from("goals").update(update).eq("id", goalId);
  return error ? { ok: false, error: "Could not update the goal." } : { ok: true };
}

// True delete (comments cascade): a mis-set goal should not leave a tombstone.
// Coach of the profile or any manager.
export async function coachDeleteGoal(actor: TeamActor, goalId: string): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}

export async function coachAddPriority(
  actor: TeamActor,
  profileId: string,
  input: { title: string; detail: string; ladder: LadderInput },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the priority first." };
  const { count } = await companyOs
    .from("coaching_priorities")
    .select("id", { count: "exact", head: true })
    .eq("coaching_profile_id", profileId);
  const { error } = await companyOs.from("coaching_priorities").insert({
    coaching_profile_id: profileId,
    title,
    detail_markdown: input.detail.trim() || null,
    sort_order: count ?? 0,
    ...ladderColumns(input.ladder),
  });
  return error ? { ok: false, error: "Could not add the priority." } : { ok: true };
}

export async function coachUpdatePriority(
  actor: TeamActor,
  priorityId: string,
  patch: { title?: string; detail?: string; status?: PriorityStatus; ladder?: LadderInput },
): Promise<Result> {
  if (!(await assertCoachOwnsRow(actor, "coaching_priorities", priorityId)))
    return { ok: false, error: "Not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The priority needs a title." };
    update.title = t;
  }
  if (patch.detail !== undefined) update.detail_markdown = patch.detail.trim() || null;
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "retired") return { ok: false, error: "Bad status." };
    update.status = patch.status;
  }
  if (patch.ladder !== undefined) Object.assign(update, ladderColumns(patch.ladder));
  const { error } = await companyOs.from("coaching_priorities").update(update).eq("id", priorityId);
  return error ? { ok: false, error: "Could not update the priority." } : { ok: true };
}

// OCEAN: coach writes; publish is the member-visibility gate (mirrors the
// shared-recap publish flow).
export type OceanInput = {
  dims: Record<OceanDimensionKey, { rating: string; evidence: string }>;
  snapshot: string;
  guidance: string;
};

export async function coachSaveOcean(
  actor: TeamActor,
  profileId: string,
  input: OceanInput,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const row: Record<string, unknown> = {
    snapshot_markdown: input.snapshot.trim() || null,
    guidance_markdown: input.guidance.trim() || null,
    updated_at: new Date().toISOString(),
  };
  for (const k of OCEAN_DIMENSIONS) {
    row[`${k}_rating`] = input.dims[k]?.rating.trim() || null;
    row[`${k}_evidence`] = input.dims[k]?.evidence.trim() || null;
  }
  const { data: existing } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  const { error } = existing
    ? await companyOs
        .from("coaching_ocean_profiles")
        .update(row)
        .eq("id", (existing as { id: string }).id)
    : await companyOs
        .from("coaching_ocean_profiles")
        .insert({ ...row, coaching_profile_id: profileId, published: false });
  return error ? { ok: false, error: "Could not save the OCEAN profile." } : { ok: true };
}

export async function coachPublishOcean(
  actor: TeamActor,
  profileId: string,
  publish: boolean,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id, snapshot_markdown, guidance_markdown")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Write the OCEAN profile first." };
  const r = data as { id: string; snapshot_markdown: string | null; guidance_markdown: string | null };
  if (publish && !r.snapshot_markdown?.trim() && !r.guidance_markdown?.trim())
    return { ok: false, error: "Write the snapshot or guidance before publishing." };
  const { error } = await companyOs
    .from("coaching_ocean_profiles")
    .update({ published: publish, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  return error ? { ok: false, error: "Could not update publishing." } : { ok: true };
}

export async function coachSetRetentionRoot(
  actor: TeamActor,
  profileId: string,
  root: RetentionRoot | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (root !== null && !(root in RETENTION_ROOT_LABELS)) return { ok: false, error: "Bad root." };
  return patchProfile(profileId, { retention_root: root });
}

// Attach a Lark Minutes link to a 1-1. The transcript pull itself is the
// cron's job (minutes_auto) or a later manual import; storing the token now
// keeps the meeting joined to its recording.
export async function coachSetMinutesLink(
  actor: TeamActor,
  meetingId: string,
  url: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const m = url.trim().match(/minutes\/([a-z0-9]+)/i);
  if (!m) return { ok: false, error: "Paste a Lark Minutes link (…/minutes/…)." };
  return patchMeeting(meetingId, { minutes_token: m[1], transcript_source: "minutes_link" });
}

export async function coachSetCadence(
  actor: TeamActor,
  profileId: string,
  cadenceDays: number,
  nextOneOnOneOn: string | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const days = Math.round(cadenceDays);
  if (!Number.isFinite(days) || days < 7 || days > 90)
    return { ok: false, error: "Cadence must be between 7 and 90 days." };
  if (nextOneOnOneOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextOneOnOneOn))
    return { ok: false, error: "Bad date." };
  return patchProfile(profileId, { cadence_days: days, next_one_on_one_on: nextOneOnOneOn });
}

export async function coachSetPrivateProfile(
  actor: TeamActor,
  profileId: string,
  markdown: string,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return patchProfile(profileId, { private_profile_markdown: markdown.trim() || null });
}
