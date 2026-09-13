import { requireTeamMember } from "@/kernel/identity/team-auth";
import { teamRead, getOwnApprovalPolicy } from "@/entities/team";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { PolicyCard, formatNumber, getMemberLeave, hoursToDays } from "@/entities/time-off";
import { TimeOffPanel, type OwnRequestRow } from "./TimeOffPanel";
import { ViewToggle } from "@/kernel/ui/ViewToggle";
import { TimeOffCalendar, type CalendarEntry } from "@/entities/time-off";

export const metadata = {
  title: "Time Off",
  description: "Request time off and see your balance and history.",
};

// /team/time-off — own-service only. Every read below is filtered to the
// actor's own team_member id (never a client-supplied one), matching the
// scoped-write actions in ./actions.ts.
export default async function TeamTimeOffPage() {
  const actor = await requireTeamMember();

  const [approvalPolicy, requestsRes, leaveById] = await Promise.all([
    getOwnApprovalPolicy(actor),
    teamRead(actor, "time_off", "id, leave_type, status, start_date, end_date, is_half_day, reason")
      .eq("team_member_id", actor.teamMemberId)
      .order("start_date", { ascending: false })
      .limit(200),
    getMemberLeave([actor.teamMemberId]),
  ]);

  const rawRows = (requestsRes.data ?? []) as unknown as {
    id: string;
    leave_type: string;
    status: string;
    start_date: string;
    end_date: string;
    is_half_day: boolean;
    reason: string | null;
  }[];

  const rows = rawRows.map(
    (r): OwnRequestRow => ({
      id: r.id,
      leaveType: r.leave_type,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      isHalfDay: r.is_half_day,
      reason: r.reason,
    }),
  );

  // The balance comes from the actor's leave policy when it carries accrual
  // rules: accrued to date under those rules, less approved and taken leave.
  // A policy without rules (no paid leave) has no balance to show.
  const leave = leaveById.get(actor.teamMemberId) ?? null;
  const computed = leave?.balance ?? null;
  const hpd = leave?.policy?.accrual.hoursPerDay ?? 8;
  const days = (h: number) => formatNumber(hoursToDays(h, hpd));

  const policyName = leave?.policy?.name ?? null;

  const views = [
    {
      key: "list",
      label: "List",
      content: <TimeOffPanel rows={rows} autoApprove={approvalPolicy.autoApprove} />,
    },
    {
      key: "calendar",
      label: "Calendar",
      content: (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Your leave</h2>
          <TimeOffCalendar
            entries={rows.map(
              (r): CalendarEntry => ({
                id: r.id,
                // Own leave only on this page, so the chip labels the
                // leave type instead of repeating the actor's name.
                name: null,
                leaveType: r.leaveType,
                status: r.status,
                startDate: r.startDate,
                endDate: r.endDate,
                isHalfDay: r.isHalfDay,
              }),
            )}
          />
        </div>
      ),
    },
  ];
  if (leave?.policy) {
    views.push({
      key: "policy",
      label: "Policy",
      content: (
        <PolicyCard
          policy={leave.policy}
          balance={computed}
          anniversaryDate={leave.anniversaryDate}
          title={`Your policy: ${leave.policy.name}`}
        />
      ),
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="Time Off"
        sub={policyName ? `Policy: ${policyName}` : "Request and track your leave."}
      />

      {computed && (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard
            label="Accrued"
            value={days(computed.accruedHours + computed.anchorHours + computed.adjustedHours)}
            sub={`days so far this policy year · ${formatNumber(computed.accruedHours + computed.anchorHours + computed.adjustedHours)} h`}
          />
          <MetricCard label="Used" value={days(computed.usedHours)} sub={`days taken · ${formatNumber(computed.usedHours)} h`} />
          <MetricCard
            label="Remaining"
            value={days(computed.remainingHours)}
            sub={
              computed.remainingHours < 0
                ? "taken in advance of accrual"
                : computed.pendingHours > 0
                  ? `days left · ${days(computed.pendingHours)} more awaiting approval`
                  : `days left · ${formatNumber(computed.remainingHours)} h`
            }
          />
        </div>
      )}

      <ViewToggle views={views} />
    </>
  );
}
