// Client-visible time-off for assigned staff. A dedicated, reviewed helper —
// same reasoning as entities/portal/lib/team.ts: the scope is two-step (assignments ->
// derived team_member ids) and the column list is hard-restricted well below
// what admin/time-off.ts exposes internally.
//
// PRIVACY HARD LINE (docs/plans/2026-07-11-client-portal-design.md): a client
// sees person, leave type, dates, half-day flag, and status ("who is out
// when"), and NOTHING else. `reason` and `manager_note` are free text that can
// hold medical/personal detail and must never be selected here, even to
// discard client-side — don't add them to the select list. Pending
// (`requested`) rows show as "pending" with no other detail, so the select
// list is identical regardless of status.
//
// Relaxed per Dave, 2026-08-26: the admin History table's directory columns
// (approver, team, location, leave policy, work schedule, balances) are now
// client-visible for a client's OWN assigned staff — see
// getAssignedLeaveDirectory below. The reason/manager_note line above is
// unchanged and stays absolute.

import { companyOs } from "@/kernel/data/supabase";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { getAssignedTeamMemberIds } from "@/entities/portal/lib/team";
import { resolveLeaveApprover, teamMemberIdsManagedBy } from "@/entities/team";
import { updateTimeOff } from "@/entities/team";

export type PortalTimeOffEntry = {
  id: string;
  teamMemberId: string;
  fullName: string | null;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
};

type Row = {
  id: string;
  team_member_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
};

type NameRow = { id: string; full_name: string | null };

// No date window: clients can page the calendar back through history and
// forward through booked leave (per Dave, 2026-08-18 — planning visibility
// beats a narrow horizon; volume is small). The privacy line is the restricted
// column list above, not the date range.
const VISIBLE_STATUSES = ["requested", "approved", "taken"] as const;

export async function getAssignedTimeOff(actor: PortalActor): Promise<PortalTimeOffEntry[]> {
  const memberIds = await getAssignedTeamMemberIds(actor);
  if (memberIds.length === 0) return [];

  const { data } = await companyOs
    .from("time_off")
    .select("id, team_member_id, leave_type, status, start_date, end_date, is_half_day")
    .in("team_member_id", memberIds)
    .in("status", VISIBLE_STATUSES)
    .order("start_date", { ascending: true });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Directory-safe name lookup only — no other team_directory columns.
  const { data: directoryRows } = await companyOs
    .from("team_directory")
    .select("id, full_name")
    .in("id", memberIds);
  const nameById = new Map(((directoryRows ?? []) as NameRow[]).map((r) => [r.id, r.full_name]));

  return rows.map((r) => ({
    id: r.id,
    teamMemberId: r.team_member_id,
    fullName: nameById.get(r.team_member_id) ?? null,
    leaveType: r.leave_type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
  }));
}

// ---------------------------------------------------------------------------
// Leave directory (per Dave, 2026-08-26): the same per-person table the admin
// History page shows, scoped to the client's assigned staff. Column list is
// still explicit — team_directory carries more than this (emails, employment
// fields) and no /portal code may select it wholesale.
// ---------------------------------------------------------------------------

export type PortalLeaveDirectoryRow = {
  id: string;
  fullName: string | null;
  // The client-side approver named on the placement, or null. Never the Edge8
  // manager chain — internal reporting lines don't belong in a client portal
  // (Dave, 2026-08-26: no "Dave Hajdu" in On Target's records).
  approverName: string | null;
  team: string | null;
  location: string | null;
  leavePolicy: string | null;
  workSchedule: string | null;
  status: string | null;
  usedDays: number | string | null;
  totalDays: number | string | null;
};

type LeaveDirectoryRow = {
  id: string;
  full_name: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  status: string | null;
  used_days: number | string | null;
  total_days: number | string | null;
};

export async function getAssignedLeaveDirectory(actor: PortalActor): Promise<PortalLeaveDirectoryRow[]> {
  const memberIds = await getAssignedTeamMemberIds(actor);
  if (memberIds.length === 0) return [];

  const { data } = await companyOs
    .from("team_directory")
    .select("id, full_name, team, location, leave_policy, work_schedule, status, used_days, total_days")
    .in("id", memberIds)
    .order("full_name", { ascending: true });

  // Client-side approver per member: the client_manager named on this client's
  // own active placement (oldest wins, same tie-break as resolveLeaveApprover).
  // Members without one get null; the page renders "Edge8" so the client still
  // sees the leave is handled, without naming internal staff.
  const { data: assignmentRows } = await companyOs
    .from("staff_assignments")
    .select("team_member_id, client_manager_person_id, created_at")
    .in("team_member_id", memberIds)
    .in("company_id", actor.companyScope)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true });
  const approverPersonByMember = new Map<string, string>();
  for (const a of (assignmentRows ?? []) as { team_member_id: string; client_manager_person_id: string }[]) {
    if (!approverPersonByMember.has(a.team_member_id))
      approverPersonByMember.set(a.team_member_id, a.client_manager_person_id);
  }

  const approverIds = [...new Set(approverPersonByMember.values())];
  const approverNameById = new Map<string, string | null>();
  if (approverIds.length > 0) {
    const { data: peopleRows } = await companyOs
      .from("people")
      .select("id, full_name, preferred_name")
      .in("id", approverIds);
    for (const p of (peopleRows ?? []) as { id: string; full_name: string | null; preferred_name: string | null }[]) {
      approverNameById.set(p.id, p.preferred_name || p.full_name);
    }
  }

  return ((data ?? []) as LeaveDirectoryRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    approverName: approverNameById.get(approverPersonByMember.get(r.id) ?? "") ?? null,
    team: r.team,
    location: r.location,
    leavePolicy: r.leave_policy,
    workSchedule: r.work_schedule,
    status: r.status,
    usedDays: r.used_days,
    totalDays: r.total_days,
  }));
}

// ---------------------------------------------------------------------------
// Client-side approval (docs/plans/2026-08-12-client-manager-time-off-approval.md)
//
// The one exception to the read-only, reason-free rules above, and it is
// narrow: a person named as client manager on an active placement sees the
// pending requests of THOSE people only, with the reason, because they are the
// one deciding. Scope is derived server-side from the placement rows
// (teamMemberIdsManagedBy), never from the portal role and never from client
// input. A client admin with no placements naming them gets an empty queue and
// no reasons, same as before.
// ---------------------------------------------------------------------------


export type PortalDecisionRequest = {
  id: string;
  fullName: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string | null;
  requestedAt: string | null;
};

type DecisionRow = Row & { reason: string | null; created_at: string | null };

// Does this person approve anyone's leave? Drives whether the section renders
// at all, so an approver with an empty queue still sees "Nothing waiting on
// you" instead of the section vanishing after their last decision.
export async function isClientLeaveApprover(actor: PortalActor): Promise<boolean> {
  const ids = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  return ids.length > 0;
}

export async function getLeaveDecisionQueue(actor: PortalActor): Promise<PortalDecisionRequest[]> {
  const managedIds = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  if (managedIds.length === 0) return [];

  const { data } = await companyOs
    .from("time_off")
    .select("id, team_member_id, leave_type, status, start_date, end_date, is_half_day, reason, created_at")
    .in("team_member_id", managedIds)
    .eq("status", "requested")
    .order("start_date", { ascending: true });
  const rows = (data ?? []) as DecisionRow[];
  if (rows.length === 0) return [];

  const { data: directoryRows } = await companyOs
    .from("team_directory")
    .select("id, full_name")
    .in("id", managedIds);
  const nameById = new Map(((directoryRows ?? []) as NameRow[]).map((r) => [r.id, r.full_name]));

  return rows.map((r) => ({
    id: r.id,
    fullName: nameById.get(r.team_member_id) ?? null,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
    reason: r.reason,
    requestedAt: r.created_at,
  }));
}

export type DecisionResult = { ok: true } | { ok: false; error: string };

// Records a client manager's decision. Two independent checks before any
// write: the request must belong to someone this actor manages, and it must
// still be pending. The decision is stamped on client_approved_by (people.id),
// never approved_by (team_members.id) — a client manager is not an Edge8
// employee and must not be recorded as one.
export async function decideAssignedTimeOff(
  actor: PortalActor,
  id: string,
  decision: "approved" | "rejected",
): Promise<DecisionResult> {
  if (!id) return { ok: false, error: "Missing request." };

  const managedIds = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  if (managedIds.length === 0) return { ok: false, error: "You cannot decide this request." };

  const { data: row } = await companyOs
    .from("time_off")
    .select("id, status, team_member_id")
    .eq("id", id)
    .maybeSingle();
  const target = (row as { status: string; team_member_id: string } | null) ?? null;
  if (!target || !managedIds.includes(target.team_member_id))
    return { ok: false, error: "You cannot decide this request." };
  if (target.status !== "requested")
    return { ok: false, error: "This request has already been decided." };

  // Belt and braces: the approver resolver must independently name this actor
  // for this member. Scope and approver are two different questions and both
  // have to say yes.
  const approver = await resolveLeaveApprover(target.team_member_id);
  if (!approver || approver.kind !== "client" || approver.personId !== actor.personId)
    return { ok: false, error: "You cannot decide this request." };

  const { error } = await updateTimeOff({
      status: decision,
      client_approved_by: actor.personId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "requested");
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
