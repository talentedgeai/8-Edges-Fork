import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { myProfileId } from "./member";
import { isCoach } from "./roster";
import { assertCoachOwnsProfile, type Result } from "./shared";

function validTalkingPoint(body: string): Result {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write the talking point first." };
  if (b.length > 500) return { ok: false, error: "Keep it under 500 characters." };
  return { ok: true };
}

export async function myAddTalkingPoint(actor: TeamActor, body: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validTalkingPoint(body);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_talking_points").insert({
    coaching_profile_id: profileId,
    author_team_member_id: actor.teamMemberId,
    body: body.trim(),
  });
  return error ? { ok: false, error: "Could not add the talking point." } : { ok: true };
}

export async function myDeleteTalkingPoint(actor: TeamActor, id: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId || !id) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_talking_points")
    .select("id, author_team_member_id")
    .eq("id", id)
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  const row = data as { id: string; author_team_member_id: string | null } | null;
  if (!row || row.author_team_member_id !== actor.teamMemberId)
    return { ok: false, error: "You can only delete talking points you wrote." };
  const { error } = await companyOs.from("coaching_talking_points").delete().eq("id", id);
  return error ? { ok: false, error: "Could not delete." } : { ok: true };
}

// Mark a talking point addressed (or reopen it): allowed for the profile's coach
// or the member who wrote it. Returns the profile id so the caller can revalidate
// the right page.
export async function setTalkingPointAddressed(
  actor: TeamActor,
  id: string,
  addressed: boolean,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Not found." };
  const { data } = await companyOs
    .from("coaching_talking_points")
    .select("id, coaching_profile_id, author_team_member_id")
    .eq("id", id)
    .maybeSingle();
  const row = data as
    | { id: string; coaching_profile_id: string; author_team_member_id: string | null }
    | null;
  if (!row) return { ok: false, error: "Not found." };
  const isAuthor = row.author_team_member_id === actor.teamMemberId;
  const isCoach = Boolean(await assertCoachOwnsProfile(actor, row.coaching_profile_id));
  if (!isAuthor && !isCoach) return { ok: false, error: "Not allowed." };
  const { error } = await companyOs
    .from("coaching_talking_points")
    .update({ addressed_at: addressed ? new Date().toISOString() : null })
    .eq("id", id);
  return error
    ? { ok: false, error: "Could not update." }
    : { ok: true, profileId: row.coaching_profile_id };
}
