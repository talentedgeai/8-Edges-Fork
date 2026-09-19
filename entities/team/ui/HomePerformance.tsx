import Link from "next/link";
import { formatDate } from "@/kernel/ui/format";
import type { HubPrompt } from "@/entities/coaching";

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
  prompt = null,
  emptyNote = null,
}: {
  goals: HomeGoal[];
  latest: HomeOneOnOne;
  nextOn: string | null;
  hasCoaching: boolean;
  // The one actionable line about an upcoming 1-1 (L.7), or null — which is the
  // normal state. Coaching decides when there is something to say; this only
  // draws it, and takes coaching's own type so the two cannot drift.
  prompt?: HubPrompt | null;
  // A new hire's empty state names the day-7 deadline from their plan instead
  // of the generic "once your coaching is set up".
  emptyNote?: string | null;
}) {
  const oneOnOneLine =
    [latest ? `last 1-1 ${formatDate(latest.heldOn)}` : null, nextOn ? `next ${formatDate(nextOn)}` : null]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">FAST Goals</h2>
        <Link href="/team/my-coaching?tab=goals" className="admin-cell-muted u-sm">All →</Link>
      </div>
      <div className="admin-card admin-section-card u-mb-4">
        {emptyNote && goals.length === 0 ? (
          <div className="admin-empty">
            {emptyNote} <Link href="/team/my-coaching?tab=goals">Write it →</Link>
          </div>
        ) : !hasCoaching ? (
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
        {/* The rhythm, as a fact. It used to link to /team/coaching — the
            COACH's roster, which a member who coaches nobody cannot open — so
            it now points at their own page like everything else here. */}
        {hasCoaching && oneOnOneLine && (
          <div className="admin-cell-muted u-sm u-mt-3">
            <Link href="/team/my-coaching">1-1s</Link> · {oneOnOneLine}
          </div>
        )}
        {/* And the one thing to do about it, when there is one (L.7). */}
        {prompt && (
          <div className="admin-hub-prompt u-mt-3">
            <span>{prompt.text}</span>
            <Link href={prompt.href} className="admin-btn admin-btn--sm">
              {prompt.cta}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
