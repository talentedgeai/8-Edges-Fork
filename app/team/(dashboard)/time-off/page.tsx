import { requireTeamMember } from "@/lib/team-auth";
import { teamRead, getOwnLeaveSummary, getOwnApprovalPolicy } from "@/lib/team/data";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { countWorkingDays, formatLeaveBalance } from "@/lib/admin/time-off";
import { ViewToggle } from "@/components/admin/ViewToggle";
import { TimeOffCalendar, type CalendarEntry } from "@/components/admin/TimeOffCalendar";
import { TimeOffPanel, type OwnRequestRow } from "./TimeOffPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Time Off",
  description: "Request time off and see your balance and history.",
};

// /team/time-off — own-service only. Every read below is filtered to the
// actor's own team_member id (never a client-supplied one), matching the
// scoped-write actions in ./actions.ts.
export default async function TeamTimeOffPage() {
  const actor = await requireTeamMember();

  const [summary, approvalPolicy, requestsRes] = await Promise.all([
    getOwnLeaveSummary(actor),
    getOwnApprovalPolicy(actor),
    teamRead(actor, "time_off", "id, leave_type, status, start_date, end_date, is_half_day, reason, external_source")
      .eq("team_member_id", actor.teamMemberId)
      .order("start_date", { ascending: false })
      .limit(200),
  ]);

  const rawRows = (requestsRes.data ?? []) as unknown as {
    id: string;
    leave_type: string;
    status: string;
    start_date: string;
    end_date: string;
    is_half_day: boolean;
    reason: string | null;
    external_source: string | null;
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

  // The synced balance (summary.usedDays) reflects only the Day Off snapshot,
  // which never sees leave filed here in the portal. Add this period's
  // app-native approved/taken leave (external_source is null; Day Off imports
  // carry a source, so there's no double count) so "Used" matches the requests
  // listed below. Current period is scoped to the calendar year.
  const periodStart = `${new Date().getFullYear()}-01-01`;
  const appNativeUsed = rawRows.reduce((sum, r) => {
    if (r.external_source !== null) return sum;
    if (r.status !== "approved" && r.status !== "taken") return sum;
    if (r.start_date < periodStart) return sum;
    return sum + countWorkingDays(r.start_date, r.end_date, r.is_half_day);
  }, 0);

  const total = summary?.totalDays ?? null;
  const used =
    summary?.usedDays !== null && summary?.usedDays !== undefined
      ? Math.round((summary.usedDays + appNativeUsed) * 10) / 10
      : null;
  const remaining = total !== null && used !== null ? Math.round((total - used) * 10) / 10 : null;

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="Time Off"
        sub={summary?.policyName ? `Policy: ${summary.policyName}` : "Request and track your leave."}
      />

      {total !== null && (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard label="Entitled" value={formatLeaveBalance(total)} sub="days this period" />
          <MetricCard label="Used" value={formatLeaveBalance(used)} sub="days taken" />
          <MetricCard
            label="Remaining"
            value={remaining !== null ? formatLeaveBalance(remaining) : "—"}
            sub="days left"
          />
        </div>
      )}

      <ViewToggle
        views={[
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
        ]}
      />
    </>
  );
}
