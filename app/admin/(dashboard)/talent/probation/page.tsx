import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { getProbationRows } from "@/lib/admin/probation";
import { PageHead } from "@/components/admin/PageHead";
import { Badge } from "@/components/admin/Badge";
import { formatDate } from "@/lib/admin/format";
import { saigonToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Probation",
  description: "Team members on probation and when their review is due.",
};

// Review window: managers get nudged when a probation is 2 weeks (or less) out.
const REVIEW_WINDOW_DAYS = 14;

export default async function ProbationPage() {
  await requireAdmin();
  const rows = await getProbationRows(saigonToday());
  const dueSoon = rows.filter((r) => r.daysLeft !== null && r.daysLeft <= REVIEW_WINDOW_DAYS).length;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent/team">← Team</Link>}
        title="Probation"
        sub={`${rows.length} on probation${dueSoon ? ` · ${dueSoon} review${dueSoon === 1 ? "" : "s"} due soon` : ""}`}
      />

      {rows.length === 0 ? (
        <div className="admin-empty">Nobody is on probation right now.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Manager</th>
                <th>Started</th>
                <th>Probation ends</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.daysLeft !== null && r.daysLeft < 0;
                const dueSoon = r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= REVIEW_WINDOW_DAYS;
                return (
                  <tr key={r.teamMemberId}>
                    <td className="admin-cell-strong">
                      <Link href={`/admin/talent/team/${r.teamMemberId}`}>{r.name}</Link>
                    </td>
                    <td>{r.position || <span className="admin-cell-muted">—</span>}</td>
                    <td>{r.managerName || <span className="admin-cell-muted">—</span>}</td>
                    <td>{r.startDate ? formatDate(r.startDate) : "—"}</td>
                    <td>{r.endsOn ? formatDate(r.endsOn) : <span className="admin-cell-muted">—</span>}</td>
                    <td>
                      {r.daysLeft === null ? (
                        <span className="admin-cell-muted">no date</span>
                      ) : overdue ? (
                        <Badge tone="err">Overdue {Math.abs(r.daysLeft)}d</Badge>
                      ) : dueSoon ? (
                        <Badge tone="warn">Due in {r.daysLeft}d</Badge>
                      ) : (
                        <span className="admin-cell-muted">in {r.daysLeft}d</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
