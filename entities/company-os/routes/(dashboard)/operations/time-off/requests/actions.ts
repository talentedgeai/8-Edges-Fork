"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { LEAVE_TYPES, type LeaveType } from "@/entities/team";
import { insertTimeOff, updateTimeOff } from "@/entities/team";

type Result = { ok: true } | { ok: false; error: string };

const LEAVE_TYPE_SET = new Set<string>(LEAVE_TYPES);

function refresh() {
  revalidatePath("/admin/operations/time-off/requests");
}

// Resolve the acting admin to a team_members row (via people.email) so we can
// stamp approved_by. Admins are not guaranteed to be team members, so this may
// return null, which is fine — approved_by is nullable.
async function actingTeamMemberId(email: string): Promise<string | null> {
  const { data: person } = await companyOs
    .from("people")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!person) return null;
  const { data: tm } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", person.id)
    .maybeSingle();
  return tm?.id ?? null;
}

export async function createTimeOff(input: {
  teamMemberId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
}): Promise<Result> {
  const admin = await requireAdmin();

  if (!input.teamMemberId) return { ok: false, error: "Pick a team member." };
  if (!LEAVE_TYPE_SET.has(input.leaveType)) return { ok: false, error: "Pick a leave type." };
  if (!input.startDate || !input.endDate) return { ok: false, error: "Pick start and end dates." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date cannot be before the start date." };
  if (input.isHalfDay && input.startDate !== input.endDate)
    return { ok: false, error: "A half day must be a single date." };

  // An admin logging leave IS the approval — inserting as "requested" only made
  // the same admin approve their own entry a click later. Stamp the decision.
  const approverId = await actingTeamMemberId(admin.email);
  const { error } = await insertTimeOff({
    team_member_id: input.teamMemberId,
    leave_type: input.leaveType as LeaveType,
    status: "approved",
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    start_date: input.startDate,
    end_date: input.endDate,
    is_half_day: input.isHalfDay,
    reason: input.reason.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function decideTimeOff(
  id: string,
  decision: "approved" | "rejected",
): Promise<Result> {
  const admin = await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("time_off")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Request not found." };
  // Approve only from pending; reject from pending OR approved — the latter is
  // the admin override that denies auto-approved (or previously approved) leave.
  if (decision === "approved" && row.status !== "requested")
    return { ok: false, error: "Only pending requests can be approved." };
  if (decision === "rejected" && row.status !== "requested" && row.status !== "approved")
    return { ok: false, error: "Only pending or approved leave can be denied." };

  const approverId = await actingTeamMemberId(admin.email);
  const { error } = await updateTimeOff({
      status: decision,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function cancelTimeOff(id: string): Promise<Result> {
  await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("time_off")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Request not found." };
  if (row.status === "cancelled") return { ok: true };
  if (row.status === "taken")
    return { ok: false, error: "Taken leave cannot be cancelled." };

  const { error } = await updateTimeOff({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
