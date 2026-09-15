import Link from "next/link";
import { selectTeamDirectory } from "@/entities/org";
import { PageHead } from "@/kernel/ui/PageHead";
import { PreviewRow } from "@/kernel/ui/PreviewRow";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import {
  LeaveShelf,
  formatNumber,
  getBalanceReviews,
  getMemberLeave,
  hoursToDays,
  leaveWarnings,
  selectTimeOff,
  type ShelfLeaveEntry,
} from "@/entities/time-off";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Time Off — History",
  description: "Team leave policies, work schedules, and balances.",
};

// Operations → Time Off → History. One row per team member with their approver,
// team, leave policy, policy dates and balance. Data comes from
// company_os.team_directory (team is the department, location and work schedule
// are team_members fields); the balance is computed from the member's leave
// policy rules, and a policy without rules shows none. Clicking a row opens the
// same leave shelf the client portal shows (dates, how the balance adds up, the
// ledger and the leave history), with a link to the full profile.
type DirectoryRow = {
  id: string;
  full_name: string | null;
  email: string;
  status: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  manager_name: string | null;
};

type TimeOffRow = {
  id: string;
  team_member_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
};

const muted = <span className="admin-cell-muted">—</span>;

export default async function TimeOffHistoryPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const view = firstParam(searchParams.view) === "deactivated" ? "deactivated" : "activated";

  const base = selectTeamDirectory(
      "id, full_name, email, status, team, location, leave_policy, work_schedule, manager_name",
    )
    .order("full_name", { ascending: true });
  const { data, error } =
    view === "activated" ? await base.eq("status", "active") : await base.neq("status", "active");

  const rows = (data ?? []) as unknown as DirectoryRow[];
  const ids = rows.map((r) => r.id);
  const [leaveById, timeOffRes] = await Promise.all([
    getMemberLeave(ids),
    ids.length > 0
      ? selectTimeOff("id, team_member_id, leave_type, status, start_date, end_date, is_half_day")
          .in("team_member_id", ids)
          .order("start_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (timeOffRes.error) console.error("[time-off/history] time_off read failed:", timeOffRes.error.message);
  // Client managers sign off in the portal; this page shows where each stands.
  const reviews = await getBalanceReviews(leaveById);
  const historyByMember = new Map<string, ShelfLeaveEntry[]>();
  for (const t of (timeOffRes.data ?? []) as unknown as TimeOffRow[]) {
    const list = historyByMember.get(t.team_member_id) ?? [];
    list.push({
      id: t.id,
      leaveType: t.leave_type,
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      isHalfDay: t.is_half_day,
    });
    historyByMember.set(t.team_member_id, list);
  }

  return (
    <>
      <PageHead
        eyebrow="Operations · Time Off"
        title="History"
        sub="Leave policies, policy years and balances across the team. Open a person to check the ledger."
      />

      <div className="admin-tabs" role="tablist">
        <Link
          href="/admin/operations/time-off/history"
          role="tab"
          aria-selected={view === "activated"}
          className={`admin-tab${view === "activated" ? " is-active" : ""} u-link-plain`}
        >
          Activated
        </Link>
        <Link
          href="/admin/operations/time-off/history?view=deactivated"
          role="tab"
          aria-selected={view === "deactivated"}
          className={`admin-tab${view === "deactivated" ? " is-active" : ""} u-link-plain`}
        >
          Deactivated
        </Link>
      </div>

      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Approver</th>
                <th>Team</th>
                <th>Leave policy</th>
                <th>Policy start</th>
                <th>Status</th>
                <th>Used (all time)</th>
                <th>Used (policy year)</th>
                <th>Remaining</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="admin-cell-muted">
                    No {view === "deactivated" ? "deactivated" : "active"} team members.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const leave = leaveById.get(r.id) ?? null;
                  const b = leave?.balance ?? null;
                  const hpd = leave?.policy?.accrual.hoursPerDay ?? 8;
                  const days = (h: number) => formatNumber(hoursToDays(h, hpd));
                  const review = reviews.get(r.id) ?? null;
                  const warnings = leave ? leaveWarnings(leave, review) : [];
                  return (
                    <PreviewRow
                      key={r.id}
                      eyebrow="Time off"
                      title={r.full_name || r.email}
                      preview={
                        <LeaveShelf
                          leave={leave}
                          history={historyByMember.get(r.id) ?? []}
                          warnings={warnings}
                          review={review}
                          details={[
                            { label: "Approver", value: r.manager_name || "Not set" },
                            { label: "Team", value: r.team || "Not set" },
                            { label: "Location", value: r.location || "Not set" },
                            { label: "Work schedule", value: r.work_schedule || "Not set" },
                            { label: "Profile", value: <Link href={`/admin/talent/team/${r.id}`}>Open full profile</Link> },
                          ]}
                        />
                      }
                    >
                      <td>
                        <span className="admin-cell-strong">{r.full_name || r.email}</span>
                      </td>
                      <td>{r.manager_name || muted}</td>
                      <td>{r.team || muted}</td>
                      <td>{leave?.policy?.name ?? r.leave_policy ?? muted}</td>
                      <td>{leave?.anniversaryDate ? formatDate(leave.anniversaryDate) : muted}</td>
                      <td>
                        {r.status ? (
                          <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>
                        ) : (
                          muted
                        )}
                      </td>
                      {b ? (
                        <>
                          <td className="admin-cell-mono">{days(b.usedAllTimeHours)}</td>
                          <td className="admin-cell-mono">{days(b.usedPolicyYearHours)}</td>
                          <td className="admin-cell-mono">
                            <span className={b.remainingHours < 0 ? "u-warn" : undefined}>{days(b.remainingHours)} d</span>
                            <span className="admin-cell-muted"> · {formatNumber(b.remainingHours)} h</span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="admin-cell-mono">{muted}</td>
                          <td className="admin-cell-mono">{muted}</td>
                          <td className="admin-cell-mono">{muted}</td>
                        </>
                      )}
                      <td>
                        {warnings.length > 0 ? (
                          <Badge tone="warn">{warnings.length} to check</Badge>
                        ) : review?.current ? (
                          <Badge tone="ok">Confirmed</Badge>
                        ) : b ? (
                          <Badge tone="neutral">Not confirmed</Badge>
                        ) : (
                          muted
                        )}
                      </td>
                    </PreviewRow>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
