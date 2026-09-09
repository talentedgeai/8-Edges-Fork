import Link from "next/link";
import { formatDate } from "@/kernel/ui/format";

// The "Your FAST Goals" rail card on /team home: the employee's FAST Goals as
// a compact list with progress, and the 1-1 rhythm (last shared recap, next
// date) as one line. Sized for the narrow rail; the label sits outside the
// card like the client view. Presentational; the page resolves the data.

export type HomeGoal = { id: string; title: string; pct: number | null; measure: string | null; status: string };
export type HomeOneOnOne = { heldOn: string; summary: string | null } | null;

export function HomePerformance({
  goals,
  latest,
  nextOn,
  hasCoaching,
}: {
  goals: HomeGoal[];
  latest: HomeOneOnOne;
  nextOn: string | null;
  hasCoaching: boolean;
}) {
  const oneOnOneLine =
    [latest ? `last 1-1 ${formatDate(latest.heldOn)}` : null, nextOn ? `next ${formatDate(nextOn)}` : null]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">FAST Goals</h2>
        <Link href="/team/goals" className="admin-cell-muted u-sm">All →</Link>
      </div>
      <div className="admin-card admin-section-card u-mb-4">
        {!hasCoaching ? (
          <div className="admin-empty">Your FAST Goals and 1-1s show here once your coaching is set up.</div>
        ) : goals.length === 0 ? (
          <div className="admin-empty">No FAST Goals yet. Add your first on the FAST Goals page.</div>
        ) : (
          <div className="admin-list">
            {goals.slice(0, 3).map((g) => (
              <div className="admin-list-row" key={g.id}>
                <div className="admin-list-main u-min-0">
                  <div className="admin-list-title u-truncate">{g.title}</div>
                  {g.pct !== null ? (
                    <div className="admin-progress u-mt-2">
                      <div className="admin-progress-fill" data-p={Math.round(g.pct / 10) * 10} />
                    </div>
                  ) : (
                    <div className="admin-cell-muted u-sm">{g.status}</div>
                  )}
                  {g.measure && <div className="admin-cell-muted u-sm u-mt-1">{g.measure}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {hasCoaching && oneOnOneLine && (
          <div className="admin-cell-muted u-sm u-mt-3">
            <Link href="/team/coaching">1-1s</Link> · {oneOnOneLine}
          </div>
        )}
      </div>
    </>
  );
}
