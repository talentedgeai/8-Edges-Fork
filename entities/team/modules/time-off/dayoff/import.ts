// Day Off -> company_os one-time importer. Idempotent by provenance keys, so it
// can be re-run during the build and once more at cutover (the final run).
// Correctness rules from the adversarial review are marked [RULE].
// See docs/plans/2026-07-05-dayoff-migration-plan.md.

import { companyOs } from "@/kernel/data/supabase";
import { dayoffGet, stripSecrets, dateOnly } from "./client";
import {
  EMAIL_ALIASES,
  STATUS_NAME_MAP,
  TYPE_NAME_MAP,
  type DayoffBalanceList,
  type DayoffBalanceRow,
  type DayoffEmployee,
  type DayoffEmployeeList,
  type DayoffIntervals,
  type DayoffLeaveType,
  type DayoffPolicy,
  type DayoffRequest,
  type DayoffRequestsList,
  type DayoffStatus,
  type LeaveCategory,
} from "./types";
import { one } from "@/kernel/config/embedded";
import { insertPeople, insertTeamMembers, updateTeamMembers } from "@/kernel/identity/writes";

const SOURCE = "dayoff";
const PAGE_LIMIT = 100;
const EMPLOYEE_BATCH = 5;

// Email domains that share Edge8's Day Off account but are NOT Edge8 staff (e.g.
// a customer's own employees). Their leave is not ours: skip entirely — no
// person/team_member creation, no balances, no history. Some of these people may
// later get external-manager portal access, but that is modeled separately, not
// as an Edge8 team_member.
const CUSTOMER_DOMAINS = new Set(["ontargetclinical.com"]);

function isCustomerEmail(email: string): boolean {
  return CUSTOMER_DOMAINS.has(email.split("@")[1] ?? "");
}

export type ImportReport = {
  startedAt: string;
  finishedAt?: string;
  anchorDate: string;
  leaveTypes: { dayoffName: string; category: LeaveCategory; isHours: boolean }[];
  statuses: { dayoffName: string; mapped: string | null }[];
  policies: { name: string; dayoffId: number; ruleCount: number; isDefault: boolean }[];
  employees: {
    total: number;
    matched: { dayoffId: number; name: string; email: string; policy: string | null }[];
    created: { dayoffId: number; name: string; email: string; status: string; flaggedEntity: boolean }[];
    skippedCustomer: { dayoffId: number; name: string; email: string }[];
    unmatchedDayoff: { dayoffId: number; name: string; email: string | null }[];
    unmatchedLocal: { teamMemberId: string; name: string; email: string }[];
    conflicts: string[];
  };
  requests: { fetched: number; imported: number; compOffCredits: number; markedRemoved: number; byStatus: Record<string, number> };
  balances: { adjustmentsWritten: number; byKind: Record<string, number>; perEmployee: { name: string; type: string; remaining: number }[] };
  warnings: string[];
  snapshots: number;
};

type Fail = { ok: false; error: string };
type Done = { ok: true; report: ImportReport };

let snapshotCount = 0;

async function snap(endpoint: string, params: Record<string, unknown>, payload: unknown, dayoffId?: string) {
  snapshotCount += 1;
  const { error } = await companyOs.from("dayoff_snapshot").insert({
    endpoint,
    params,
    dayoff_id: dayoffId ?? null,
    payload: stripSecrets(payload) ?? {},
  });
  if (error) throw new Error(`snapshot ${endpoint}: ${error.message}`);
}

// "message (xN)" style aggregation for warnings that repeat per employee.
function bumpCountedWarning(warnings: string[], message: string) {
  const re = new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: \\(x(\\d+)\\))?$`);
  const idx = warnings.findIndex((w) => re.test(w));
  if (idx === -1) {
    warnings.push(message);
    return;
  }
  const m = warnings[idx].match(/ \(x(\d+)\)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 2;
  warnings[idx] = `${message} (x${n})`;
}

function typeCategory(name: string | null | undefined, warnings: string[]): LeaveCategory {
  const key = (name ?? "").trim().toLowerCase();
  const mapped = TYPE_NAME_MAP[key];
  if (mapped) return mapped;
  const warning = `Unmapped Day Off leave type "${name}" -> imported as 'other'`;
  if (!warnings.includes(warning)) warnings.push(warning);
  return "other";
}

// [RULE] Statuses fail closed: unknown status -> abort, never guess.
function mapStatus(r: DayoffRequest): string {
  const key = (r.StatusName ?? "").trim().toLowerCase();
  const mapped = STATUS_NAME_MAP[key];
  if (!mapped) {
    throw new Error(
      `Unmapped Day Off status "${r.StatusName}" (id ${r.StatusID}) on request ${r.LeaveRequestID}. ` +
        `Add it to STATUS_NAME_MAP before re-running; nothing was guessed.`,
    );
  }
  return mapped;
}

// [RULE] Fan-out, don't default: /employees paginates at 10 by default and can
// filter by isActive. Fetch unfiltered + explicitly inactive, merge, and assert
// against the reported Total.
async function fetchAllEmployees(
  warnings: string[],
): Promise<{ employees: DayoffEmployee[]; activeIds: Set<number> }> {
  const byId = new Map<number, DayoffEmployee>();
  const activeIds = new Set<number>();
  let reportedTotal = 0;
  for (const isActive of [undefined, true, false] as const) {
    let page = 1;
    for (;;) {
      const res = await dayoffGet<DayoffEmployeeList>("/api/doc/employees", {
        pageNumber: page,
        limit: PAGE_LIMIT,
        isActive,
      });
      await snap("/api/doc/employees", { page, isActive: isActive ?? "all" }, res);
      const rows = res.Results ?? [];
      if (isActive === undefined) reportedTotal = res.Total ?? 0;
      for (const e of rows) {
        byId.set(e.EmployeeID, e);
        if (isActive === true) activeIds.add(e.EmployeeID);
      }
      if (rows.length < PAGE_LIMIT || page * PAGE_LIMIT >= (res.Total ?? 0)) break;
      page += 1;
    }
  }
  if (reportedTotal && byId.size < reportedTotal) {
    warnings.push(`Employee fetch collected ${byId.size} of reported ${reportedTotal}`);
  }
  return { employees: [...byId.values()], activeIds };
}

// Legal entities (all current team members are Edge8 AI). Map a created record's
// entity by email domain; unknown domains (e.g. ontargetclinical.com — a separate
// company with no matching entity) import under Edge8 AI so history is not lost,
// but are flagged for review/reassignment rather than silently mislabeled.
const EDGE8_AI_ENTITY = "b0dd0696-9801-4062-a923-30d6a195c08c";
const TALENT_EDGE_ENTITY = "996771d6-1ca5-442a-be67-30f05084c33d";

function entityForEmail(email: string): { id: string; flagged: boolean } {
  const domain = email.split("@")[1] ?? "";
  if (domain === "edge8.ai" || domain === "edge8.co") return { id: EDGE8_AI_ENTITY, flagged: false };
  if (domain === "talentedge.io" || domain === "talentedge.ai") return { id: TALENT_EDGE_ENTITY, flagged: false };
  return { id: EDGE8_AI_ENTITY, flagged: true };
}

// Find the person by email, or create a minimal employee person record.
async function resolveOrCreatePerson(
  email: string,
  name: string | null,
  flagged: boolean,
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await companyOs.from("people").select("id").eq("email", email).maybeSingle();
  if (existing) return { id: existing.id };
  const { data, error } = await insertPeople({
      email,
      full_name: name,
      is_team_member: true,
      persona: "employee",
      source: "dayoff_import",
      metadata: { dayoff_import: true, ...(flagged ? { needs_entity_review: true } : {}) },
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "person insert failed" };
  return { id: data.id };
}

// Ensure a team_member exists for this Day Off employee, idempotently. Prefers an
// existing row (by dayoff_employee_id, then by person) over creating a duplicate.
async function ensureTeamMember(
  personId: string,
  dayoffId: number,
  email: string,
  active: boolean,
  policyId: string | null,
): Promise<{ id: string } | { error: string }> {
  const link = policyId ? { dayoff_employee_id: dayoffId, leave_policy_id: policyId } : { dayoff_employee_id: dayoffId };

  const { data: byDayoff } = await companyOs.from("team_members").select("id").eq("dayoff_employee_id", dayoffId).maybeSingle();
  if (byDayoff) return { id: byDayoff.id };

  const { data: existingTm } = await companyOs.from("team_members").select("id").eq("person_id", personId).limit(1).maybeSingle();
  if (existingTm) {
    const { error } = await updateTeamMembers(link).eq("id", existingTm.id);
    return error ? { error: error.message } : { id: existingTm.id };
  }

  const { data, error } = await insertTeamMembers({ person_id: personId, status: active ? "active" : "alumni", ...link })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "team_member insert failed" };
  return { id: data.id };
}

export async function runDayoffImport(): Promise<Done | Fail> {
  snapshotCount = 0;
  const warnings: string[] = [];
  const anchorDate = new Date().toISOString().slice(0, 10);
  const report: ImportReport = {
    startedAt: new Date().toISOString(),
    anchorDate,
    leaveTypes: [],
    statuses: [],
    policies: [],
    employees: { total: 0, matched: [], created: [], skippedCustomer: [], unmatchedDayoff: [], unmatchedLocal: [], conflicts: [] },
    requests: { fetched: 0, imported: 0, compOffCredits: 0, markedRemoved: 0, byStatus: {} },
    balances: { adjustmentsWritten: 0, byKind: {}, perEmployee: [] },
    warnings,
    snapshots: 0,
  };

  try {
    // ---- Reference data --------------------------------------------------
    const [types, statuses, policies, teams, locations, schedules, categories] = await Promise.all([
      dayoffGet<DayoffLeaveType[]>("/api/doc/leaveTypes"),
      dayoffGet<DayoffStatus[]>("/api/doc/leaveRequestStatuses"),
      dayoffGet<DayoffPolicy[]>("/api/doc/leavepolicies"),
      dayoffGet<unknown>("/api/doc/teams"),
      dayoffGet<unknown>("/api/doc/locations"),
      dayoffGet<unknown>("/api/doc/workschedules"),
      dayoffGet<unknown>("/api/doc/leaveTypes/categories"),
    ]);
    await snap("/api/doc/leaveTypes", {}, types);
    await snap("/api/doc/leaveRequestStatuses", {}, statuses);
    await snap("/api/doc/leavepolicies", {}, policies);
    await snap("/api/doc/teams", {}, teams);
    await snap("/api/doc/locations", {}, locations);
    await snap("/api/doc/workschedules", {}, schedules);
    await snap("/api/doc/leaveTypes/categories", {}, categories);

    // [RULE] Hours types: assert-and-halt (day-math corruption otherwise).
    const hoursTypes = (types ?? []).filter((t) => t.IsHours);
    if (hoursTypes.length > 0) {
      return { ok: false, error: `Hours-based leave types exist (${hoursTypes.map((t) => t.Name).join(", ")}); the importer only supports day-based math. Stop and extend the model first.` };
    }
    const typeById = new Map<number, DayoffLeaveType>();
    for (const t of types ?? []) {
      typeById.set(t.LeaveTypeID, t);
      report.leaveTypes.push({ dayoffName: t.Name, category: typeCategory(t.Name, warnings), isHours: t.IsHours });
    }
    for (const s of statuses ?? []) {
      report.statuses.push({ dayoffName: s.Name, mapped: STATUS_NAME_MAP[(s.Name ?? "").trim().toLowerCase()] ?? null });
    }

    // ---- Policies ---------------------------------------------------------
    // Duplicate policy names hard-fail: employee assignment resolves by name.
    const policyNames = new Map<string, number>();
    for (const p of policies ?? []) {
      const n = p.Name.trim().toLowerCase();
      policyNames.set(n, (policyNames.get(n) ?? 0) + 1);
    }
    const dupes = [...policyNames.entries()].filter(([, c]) => c > 1);
    if (dupes.length > 0) {
      return { ok: false, error: `Duplicate Day Off policy names (${dupes.map(([n]) => n).join(", ")}); employee assignment resolves by name and would misassign.` };
    }

    const policyIdByName = new Map<string, string>();
    for (const p of policies ?? []) {
      // Only IsSelected rows become rules; unselected are phantom entitlements.
      const rules = (p.CompanyLeaveTypes ?? [])
        .filter((l) => l.IsSelected)
        .map((l) => ({
          leaveType: typeCategory(l.LeaveTypeName ?? typeById.get(l.LeaveTypeID)?.Name, warnings),
          dayoffLeaveTypeId: l.LeaveTypeID,
          dayoffCompanyLeaveTypeId: l.CompanyLeaveTypeID,
          dayoffTypeName: l.LeaveTypeName ?? typeById.get(l.LeaveTypeID)?.Name ?? null,
          annualAmount: l.DefaultBalance,
          // [RULE] MonthlyReset means the allowance is PER MONTH.
          resetCadence: l.MonthlyReset ? "monthly" : "annual",
          resetTypeId: l.BalanceResetTypeID,
          resetMonth: l.BalanceResetMonthID,
          accrualTypeId: l.AccrualTypeID,
          accrualMonthStart: l.IsAccrualMonthStart,
          accrualNextDate: l.AccrualNextDate,
          // [RULE] hasCarry is the master switch; null cap = unlimited only when true.
          hasCarry: l.HasCarry,
          carryCap: l.CarryLimitedBalance,
          carryExpiryDays: l.CarryExpiredDurationInDays,
          // [RULE] allowNegative from the flag; null max = unlimited when true.
          allowNegative: l.AllowsNegativeBalance,
          maxNegative: l.MaxNegativeNumber,
          affectsBalance: !l.AllowsInfiniteBalance,
          maxUnusedBalance: l.MaxUnusedBalance,
          probationAmount: l.BalanceEffectiveAfter,
          probationUnitId: l.BalanceEffectiveAfterUnitID,
          allowHalfDay: l.IsHalfDay,
          requiresApproval: !l.ApprovalNotRequired,
          reasonRequired: l.IsReasonRequired,
          countHolidays: l.CountHolidays,
          countHolidaysAfterDays: l.CountHolidaysAfter,
          countWeekends: l.CountWeekends,
          countWeekendsAfterDays: l.CountWeekendsAfter,
        }));

      const { data: up, error } = await companyOs
        .from("leave_policies")
        .upsert(
          { dayoff_id: p.LeavePolicyID, name: p.Name, rules, source: stripSecrets(p), updated_at: new Date().toISOString() },
          { onConflict: "dayoff_id" },
        )
        .select("id")
        .single();
      if (error || !up) return { ok: false, error: `policy upsert '${p.Name}': ${error?.message}` };
      policyIdByName.set(p.Name.trim().toLowerCase(), up.id);
      report.policies.push({ name: p.Name, dayoffId: p.LeavePolicyID, ruleCount: rules.length, isDefault: p.IsDefault });
    }

    // ---- Employees + matching ---------------------------------------------
    // Import EVERYONE in Day Off (active and terminated) — the history is the
    // point. Match to a team_member by email across ALL statuses; if none exists,
    // create a minimal person + team_member so the history has somewhere to hang.
    const { employees: dayoffEmployees, activeIds } = await fetchAllEmployees(warnings);
    report.employees.total = dayoffEmployees.length;

    const { data: members, error: mErr } = await companyOs
      .from("team_members")
      .select("id, status, dayoff_employee_id, people!person_id(id, email, full_name)");
    if (mErr) return { ok: false, error: `team_members read: ${mErr.message}` };
    type MemberRow = { id: string; status: string; dayoff_employee_id: number | null; people: { id: string; email: string; full_name: string | null } | { id: string; email: string; full_name: string | null }[] | null };
    const memberByEmail = new Map<string, { id: string; name: string; email: string }>();
    for (const m of (members ?? []) as MemberRow[]) {
      const p = one(m.people);
      if (p?.email) memberByEmail.set(p.email.trim().toLowerCase(), { id: m.id, name: p.full_name ?? p.email, email: p.email });
    }

    const memberIdByDayoffId = new Map<number, string>();
    const matchedEmails = new Set<string>();
    for (const e of dayoffEmployees) {
      const raw = (e.Email ?? "").trim().toLowerCase();
      const email = EMAIL_ALIASES[raw] ?? raw;
      if (!email) {
        report.employees.unmatchedDayoff.push({ dayoffId: e.EmployeeID, name: e.Name ?? "?", email: e.Email });
        warnings.push(`Day Off employee ${e.Name} (${e.EmployeeID}) has no email; cannot import`);
        continue;
      }

      // Customer-domain accounts (e.g. On Target Clinical) share the Day Off
      // account but are not Edge8 staff — skip them entirely.
      if (isCustomerEmail(email)) {
        report.employees.skippedCustomer.push({ dayoffId: e.EmployeeID, name: e.Name ?? email, email });
        continue;
      }

      const policyId = e.LeavePolicyName ? policyIdByName.get(e.LeavePolicyName.trim().toLowerCase()) ?? null : null;
      if (e.LeavePolicyName && !policyId) warnings.push(`Employee ${e.Name}: policy "${e.LeavePolicyName}" not found among imported policies`);

      const local = memberByEmail.get(email);
      if (local) {
        matchedEmails.add(email);
        memberIdByDayoffId.set(e.EmployeeID, local.id);
        const { error: uErr } = await updateTeamMembers({ dayoff_employee_id: e.EmployeeID, ...(policyId ? { leave_policy_id: policyId } : {}) })
          .eq("id", local.id);
        if (uErr) {
          report.employees.conflicts.push(`link ${e.Name} (${e.EmployeeID}) -> ${local.id}: ${uErr.message}`);
          continue;
        }
        report.employees.matched.push({ dayoffId: e.EmployeeID, name: local.name, email: local.email, policy: e.LeavePolicyName });
        continue;
      }

      // No team_member for this Day Off account: create the records it needs.
      const active = activeIds.has(e.EmployeeID);
      const { flagged } = entityForEmail(email);
      const person = await resolveOrCreatePerson(email, e.Name, flagged);
      if ("error" in person) {
        report.employees.conflicts.push(`create person ${email}: ${person.error}`);
        continue;
      }
      const tm = await ensureTeamMember(person.id, e.EmployeeID, email, active, policyId);
      if ("error" in tm) {
        report.employees.conflicts.push(`create team_member ${email}: ${tm.error}`);
        continue;
      }
      matchedEmails.add(email);
      memberIdByDayoffId.set(e.EmployeeID, tm.id);
      report.employees.created.push({ dayoffId: e.EmployeeID, name: e.Name ?? email, email, status: active ? "active" : "alumni", flaggedEntity: flagged });
    }
    for (const [email, m] of memberByEmail) {
      if (!matchedEmails.has(email)) report.employees.unmatchedLocal.push({ teamMemberId: m.id, name: m.name, email: m.email });
    }

    // ---- Per-employee: intervals, requests, balances, schedules -----------
    const matched = dayoffEmployees.filter((e) => memberIdByDayoffId.has(e.EmployeeID));
    for (let i = 0; i < matched.length; i += EMPLOYEE_BATCH) {
      const batch = matched.slice(i, i + EMPLOYEE_BATCH);
      const results = await Promise.all(batch.map((e) => importEmployee(e, memberIdByDayoffId, typeById, anchorDate, report, warnings)));
      const failed = results.find((r) => r !== null);
      if (failed) return { ok: false, error: failed };
    }

    // Capture per-employee data for UNMATCHED Day Off employees too (snapshot
    // only, no transforms) so nothing dies with the account. Customer-domain
    // accounts are intentionally excluded — their leave is not ours to capture.
    for (const e of dayoffEmployees.filter(
      (x) => !memberIdByDayoffId.has(x.EmployeeID) && !isCustomerEmail((EMAIL_ALIASES[(x.Email ?? "").trim().toLowerCase()] ?? (x.Email ?? "").trim().toLowerCase())),
    )) {
      try {
        const reqs = await dayoffGet<DayoffRequestsList>(`/api/doc/employees/${e.EmployeeID}/leaveRequests`);
        await snap(`/api/doc/employees/leaveRequests`, { employee: e.EmployeeID, group: "default" }, reqs, String(e.EmployeeID));
      } catch {
        bumpCountedWarning(warnings, "snapshot-only capture failed for an unmatched employee");
      }
      try {
        const intervals = await dayoffGet<DayoffIntervals>(`/api/doc/employeeIntervals/${e.EmployeeID}`);
        await snap(`/api/doc/employeeIntervals`, { employee: e.EmployeeID }, intervals, String(e.EmployeeID));
      } catch {
        bumpCountedWarning(warnings, "employeeIntervals endpoint failed (Day Off-side HTTP 500; capture-only, no data impact)");
      }
    }

    report.snapshots = snapshotCount;
    report.finishedAt = new Date().toISOString();
    await snap("__import_report", { anchorDate }, report);
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Returns an error string to abort the whole run (fail-closed cases), or null.
async function importEmployee(
  e: DayoffEmployee,
  memberIdByDayoffId: Map<number, string>,
  typeById: Map<number, DayoffLeaveType>,
  anchorDate: string,
  report: ImportReport,
  warnings: string[],
): Promise<string | null> {
  const teamMemberId = memberIdByDayoffId.get(e.EmployeeID)!;

  // Intervals are capture-only (requests/balances use IntervalGroupOrderEnum
  // directly), so a Day Off-side failure here is a warning, not an abort. The
  // endpoint 500s for every employee on Day Off's side, so aggregate the noise
  // into a single counted warning.
  try {
    const intervals = await dayoffGet<DayoffIntervals>(`/api/doc/employeeIntervals/${e.EmployeeID}`);
    await snap("/api/doc/employeeIntervals", { employee: e.EmployeeID }, intervals, String(e.EmployeeID));
  } catch {
    bumpCountedWarning(warnings, "employeeIntervals endpoint failed (Day Off-side HTTP 500; capture-only, no data impact)");
  }

  // Requests across interval groups, deduped by LeaveRequestID. Groups 0/1/2
  // are previous/current/next; anything older (the 2026 import could not reach
  // 2024) is walked backwards from -1 until an interval comes back empty.
  // Walking back EVERY run also keeps old external ids in the fetched set, so
  // the deletion reconciliation below never tombstones history that merely
  // aged out of a fixed window.
  const seen = new Map<number, DayoffRequest>();
  const fetchGroup = async (group: number): Promise<number> => {
    const res = await dayoffGet<DayoffRequestsList>(`/api/doc/employees/${e.EmployeeID}/leaveRequests`, {
      IntervalGroupOrderEnum: group,
    });
    await snap("/api/doc/employees/leaveRequests", { employee: e.EmployeeID, group }, res, String(e.EmployeeID));
    const items = [...(res.Pending ?? []), ...(res.History ?? [])];
    for (const r of items) seen.set(r.LeaveRequestID, r);
    return items.length;
  };
  for (const group of [0, 1, 2]) await fetchGroup(group);
  for (let group = -1; group >= -10; group--) {
    try {
      if ((await fetchGroup(group)) === 0) break;
    } catch {
      // Day Off rejecting a negative group means no older intervals exist (or
      // the enum bottomed out) — history simply stops here.
      bumpCountedWarning(warnings, "older interval group fetch failed (pre-window history unavailable)");
      break;
    }
  }
  report.requests.fetched += seen.size;

  const fetchedExternalIds: string[] = [];
  for (const r of seen.values()) {
    // [RULE] comp-off is a CREDIT -> adjustments, never a time_off deduction.
    if (r.IsCompOff) {
      const delta = Math.abs(r.NumberOfDays ?? 0);
      const category = typeCategory(r.LeaveTypeName ?? typeById.get(r.LeaveTypeID)?.Name, warnings);
      const { error } = await companyOs.from("leave_adjustments").upsert(
        {
          team_member_id: teamMemberId,
          leave_type: category,
          delta_days: delta,
          kind: "comp",
          reason: r.Description || "Day Off comp-off credit",
          effective_date: dateOnly(r.FromDate) ?? anchorDate,
          source: SOURCE,
          external_key: `${e.EmployeeID}:req:${r.LeaveRequestID}:comp`,
        },
        { onConflict: "source,external_key" },
      );
      if (error) return `comp-off adjustment (req ${r.LeaveRequestID}): ${error.message}`;
      report.requests.compOffCredits += 1;
      continue;
    }

    let status: string;
    try {
      status = mapStatus(r); // [RULE] fail closed
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }

    const start = dateOnly(r.FromDate);
    const end = dateOnly(r.ToDate);
    if (!start || !end) {
      warnings.push(`Request ${r.LeaveRequestID}: unparseable dates (${r.FromDate} / ${r.ToDate}); skipped`);
      continue;
    }
    const days = r.NumberOfDays ?? null;
    // [RULE] composite external id: one Day Off request can span many employees.
    const externalId = `${r.LeaveRequestID}:${e.EmployeeID}`;
    fetchedExternalIds.push(externalId);

    const approverDayoffId = r.ForcedByID ?? r.Approver1ID;
    const approvedBy = approverDayoffId ? memberIdByDayoffId.get(approverDayoffId) ?? null : null;

    const { error } = await companyOs.from("time_off").upsert(
      {
        external_source: SOURCE,
        external_id: externalId,
        team_member_id: teamMemberId,
        leave_type: typeCategory(r.LeaveTypeName ?? typeById.get(r.LeaveTypeID)?.Name, warnings),
        status,
        start_date: start,
        end_date: end,
        is_half_day: days === 0.5 && start === end, // [RULE] inference; no read endpoint exposes the flag
        days,
        reason: r.Description || null,
        manager_note: r.ManagerRejectionReason || null,
        requested_at: r.CreatedAt ?? null,
        approved_by: approvedBy,
      },
      { onConflict: "external_source,external_id" },
    );
    if (error) return `request upsert (${externalId}): ${error.message}`;
    report.requests.imported += 1;
    report.requests.byStatus[status] = (report.requests.byStatus[status] ?? 0) + 1;
  }

  // [RULE] deletion reconciliation: imported rows for this member that vanished
  // from Day Off get tombstoned as cancelled, never hard-deleted.
  const { data: existing } = await companyOs
    .from("time_off")
    .select("id, external_id, status")
    .eq("team_member_id", teamMemberId)
    .eq("external_source", SOURCE);
  for (const row of (existing ?? []) as { id: string; external_id: string; status: string }[]) {
    if (!fetchedExternalIds.includes(row.external_id) && !row.external_id.endsWith(":comp") && row.status !== "cancelled") {
      const { error } = await companyOs
        .from("time_off")
        .update({ status: "cancelled", manager_note: "Removed in Day Off after a prior import (tombstoned by sync)" })
        .eq("id", row.id);
      if (error) return `tombstone ${row.external_id}: ${error.message}`;
      report.requests.markedRemoved += 1;
    }
  }

  // Balances: adjustments come from the CURRENT interval group only.
  // [RULE] balance anchor: the four adjustment rows sum EXACTLY to Day Off's
  // remaining balance (TotalBalance - UsedBalance); imported request history is
  // excluded from balance math, so computed balance == Day Off remaining.
  for (const group of [0, 1, 2]) {
    const res = await dayoffGet<DayoffBalanceList | DayoffBalanceRow[]>(`/api/doc/balances/${e.EmployeeID}`, {
      intervalGroupOrderEnum: group,
    });
    await snap("/api/doc/balances", { employee: e.EmployeeID, group }, res, String(e.EmployeeID));
    // Group 1 = current interval, verified against the exported balance report
    // (Binh Tran 10.15/7 matches group 1). 0 = previous, 2 = next.
    if (group !== 1) continue;

    // The live API returns a raw array (the OpenAPI spec claims {Results:[...]});
    // accept both shapes.
    const balanceRows = Array.isArray(res) ? res : res.Results ?? [];
    for (const b of balanceRows as DayoffBalanceRow[]) {
      if (!b.IsActive || !b.LeaveTypeEnable) continue;
      const category = typeCategory(b.LeaveTypeName ?? typeById.get(b.LeaveTypeID)?.Name, warnings);
      const round4 = (n: number) => Math.round(n * 10000) / 10000;
      const remaining = round4((b.TotalBalance ?? 0) - (b.UsedBalance ?? 0));
      const carry = b.CarryBalance ?? 0;
      const correction = b.Adjustment ?? 0;
      const comp = b.CompOffBalance ?? 0;
      const opening = round4(remaining - carry - correction - comp); // sum invariant

      const rows = [
        { kind: "carryover", delta: carry },
        { kind: "correction", delta: correction },
        { kind: "comp", delta: comp },
        { kind: "opening_balance", delta: opening },
      ].filter((r) => r.delta !== 0 || r.kind === "opening_balance");

      for (const { kind, delta } of rows) {
        const { error } = await companyOs.from("leave_adjustments").upsert(
          {
            team_member_id: teamMemberId,
            leave_type: category,
            delta_days: delta,
            kind,
            reason: `Day Off import anchor (${anchorDate})`,
            effective_date: anchorDate,
            source: SOURCE,
            external_key: `${e.EmployeeID}:${b.LeaveTypeID}:current:${kind}`,
          },
          { onConflict: "source,external_key" },
        );
        if (error) return `balance adjustment (${e.EmployeeID}/${b.LeaveTypeID}/${kind}): ${error.message}`;
        report.balances.adjustmentsWritten += 1;
        report.balances.byKind[kind] = (report.balances.byKind[kind] ?? 0) + 1;
      }
      report.balances.perEmployee.push({ name: e.Name ?? String(e.EmployeeID), type: category, remaining });
    }
  }

  // Work schedules: snapshot only (deferred model), current year window.
  try {
    const year = anchorDate.slice(0, 4);
    const sched = await dayoffGet<unknown>(`/api/doc/employees/${e.EmployeeID}/workSchedules`, {
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    await snap("/api/doc/employees/workSchedules", { employee: e.EmployeeID, year }, sched, String(e.EmployeeID));
  } catch (err) {
    warnings.push(`workSchedules capture failed for ${e.EmployeeID}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}
