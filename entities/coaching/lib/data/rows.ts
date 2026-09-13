import { one } from "@/kernel/config/embedded";
import { type CommitmentOwner, type CommitmentStatus } from "../types";

export type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export const displayName = (p: PersonEmbed | null): string =>
  p?.preferred_name || p?.full_name || p?.email || "-";

export type CoachingMember = {
  teamMemberId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
};

export const MEMBER_EMBED =
  "team_members:team_members!team_member_id(id, " +
  "people:people!person_id(full_name, preferred_name, email, avatar_url), " +
  "positions:positions!position_id(title))";

export function toMember(raw: Record<string, unknown>): CoachingMember {
  const tm = one(raw.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    teamMemberId: (tm?.id as string) ?? "",
    name: displayName(person),
    email: person?.email ?? null,
    avatarUrl: person?.avatar_url ?? null,
    positionTitle: pos?.title ?? null,
  };
}

export type Commitment = {
  id: string;
  coachingProfileId: string;
  oneOnOneId: string | null;
  title: string;
  owner: CommitmentOwner;
  dueOn: string | null;
  status: CommitmentStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  // Position in the one shared priority stack; lower sorts first.
  sortOrder: number;
  // The team member who wrote it. Null on rows predating authorship, which
  // reads as coach-authored — only the author may retitle or delete.
  createdBy: string | null;
};

export function toCommitment(r: Record<string, unknown>): Commitment {
  return {
    id: r.id as string,
    coachingProfileId: r.coaching_profile_id as string,
    oneOnOneId: (r.one_on_one_id as string | null) ?? null,
    title: r.title as string,
    owner: r.owner as CommitmentOwner,
    dueOn: (r.due_on as string | null) ?? null,
    status: r.status as CommitmentStatus,
    statusNote: (r.status_note as string | null) ?? null,
    statusUpdatedAt: (r.status_updated_at as string | null) ?? null,
    createdAt: r.created_at as string,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: (r.created_by as string | null) ?? null,
  };
}

export const COMMITMENT_SELECT =
  "id, coaching_profile_id, one_on_one_id, title, owner, due_on, status, status_note, status_updated_at, created_at, sort_order, created_by";
