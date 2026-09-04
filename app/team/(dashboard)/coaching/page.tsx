import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { PageHead } from "@/components/admin/PageHead";
import {
  canManageRoster,
  getCoachRoster,
  getRosterCandidates,
  type CoachRosterRow,
  type RosterAttention,
} from "@/lib/coaching/data";
import { AddToRoster } from "@/components/coaching/AddToRoster";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coaching",
  description: "Your 1-1 coaching roster: FAST goals, cadence, commitments.",
};

// /team/coaching - the coach's dashboard, the in-app rebuild of the Lark
// "Team Coaching" wiki. Access is granted by coaching_profiles rows, not the
// manager role: a dotted-line coach sees exactly the people whose profile
// carries their coach_id, and nobody else (getCoachRoster injects the scope).
export default async function CoachingDashboardPage() {
  const actor = await requireTeamMember();
  const roster = await getCoachRoster(actor);
  // Managers with an empty roster still land here so they can add their
  // first person; everyone else without a roster has no business on the page.
  const manageable = await canManageRoster(actor);
  if (roster.length === 0 && !manageable) redirect("/team");
  const candidates = manageable ? await getRosterCandidates(actor) : [];

  return (
    <>
      <PageHead
        title="Coaching"
        sub={`${roster.length} ${roster.length === 1 ? "person" : "people"} on your roster · biweekly 1-1s, commitments, and growth trends`}
      />

      {roster.length > 0 && (
        <div className="admin-card admin-coach-attention">
          <div className="admin-card-title">The roster at a glance</div>
          <p className="admin-hint admin-coach-dash-hint">
            Private to you. Mode shows the last 1-1&apos;s Coach / Mentor / Direct split; the target
            is 80 / 15 / 5.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table admin-coach-dash-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Last → Next 1-1</th>
                  <th>Mode C/M/D</th>
                  <th>Top Priority</th>
                  <th>Loose Root</th>
                  <th>Attention</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.profileId}>
                    <td>
                      <Link href={`/team/coaching/${r.profileId}`} className="admin-cell-strong">
                        {r.member.name}
                      </Link>
                    </td>
                    <td>
                      {fmtShort(r.lastHeldOn)} → {fmtShort(r.nextOneOnOneOn)}
                    </td>
                    <td>
                      {r.lastModeSplit ? (
                        <span className="admin-cell-mono">
                          {r.lastModeSplit.coach} / {r.lastModeSplit.mentor} / {r.lastModeSplit.direct}
                        </span>
                      ) : (
                        <span className="admin-cell-muted">-</span>
                      )}
                    </td>
                    <td>{r.topPriority ?? <span className="admin-cell-muted">-</span>}</td>
                    <td>{r.retentionRoot ? ROOT_LABELS[r.retentionRoot] : <span className="admin-cell-muted">-</span>}</td>
                    <td>
                      {r.attention.length === 0 ? (
                        <span className="admin-badge admin-badge--ok">clear</span>
                      ) : (
                        r.attention.map((a, i) => (
                          <span key={i} className="admin-badge admin-badge--warn admin-coach-dash-flag">
                            {attentionLabel(a)}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-coach-roster">
        {roster.map((r) => (
          <RosterCard key={r.profileId} row={r} />
        ))}
      </div>

      <AddToRoster candidates={candidates} />
    </>
  );
}

function attentionLabel(a: RosterAttention): string {
  switch (a.kind) {
    case "overdue":
      return `${a.daysSince}d since last 1-1`;
    case "never_met":
      return "no 1-1 yet";
    case "goal_not_set":
      return "no FAST goal";
    case "checkin_unanswered":
      return "check-in unanswered";
  }
}

function fmt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Compact date for the dashboard table (the Lark dashboard's MM-DD feel).
function fmtShort(iso: string | null): string {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const ROOT_LABELS: Record<string, string> = {
  belonging: "Belonging",
  links: "Links",
  sacrifice: "Sacrifice",
  watching: "Watching",
};

function RosterCard({ row }: { row: CoachRosterRow }) {
  return (
    <Link href={`/team/coaching/${row.profileId}`} className="admin-card admin-coach-card">
      <div className="admin-coach-card-head">
        {row.member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.member.avatarUrl} alt="" width={40} height={40} className="admin-avatar admin-avatar--lg" />
        ) : (
          <span className="admin-avatar admin-avatar--lg admin-avatar--tint" aria-hidden>
            {row.member.name.slice(0, 1)}
          </span>
        )}
        <div>
          <div className="admin-coach-card-name">{row.member.name}</div>
          <div className="admin-coach-card-role">{row.member.positionTitle ?? "-"}</div>
        </div>
        {row.attention.length > 0 && (
          <span className="admin-badge admin-badge--warn admin-coach-card-flag">
            {row.attention.length} flag{row.attention.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="admin-coach-card-goal">
        {row.activeGoals.length > 0 ? (
          <span>{row.activeGoals.join(" · ")}</span>
        ) : (
          <span className="admin-cell-muted">No active FAST goal</span>
        )}
        {row.activeGoals.length === 0 && <span className="admin-badge admin-badge--err">No goal</span>}
      </div>

      <div className="admin-coach-card-meta">
        <span>
          <strong>{row.heldCount}</strong> 1-1{row.heldCount === 1 ? "" : "s"}
        </span>
        <span>
          Last <strong>{fmt(row.lastHeldOn)}</strong>
        </span>
        <span>
          Next <strong>{fmt(row.nextOneOnOneOn)}</strong>
        </span>
        <span>
          <strong>{row.openCommitments}</strong> open commitment{row.openCommitments === 1 ? "" : "s"}
        </span>
        <span title="Coach / Mentor / Direct on the last logged 1-1, target 80/15/5">
          Mode{" "}
          <strong>
            {row.lastModeSplit
              ? `${row.lastModeSplit.coach}/${row.lastModeSplit.mentor}/${row.lastModeSplit.direct}`
              : "-"}
          </strong>
        </span>
        <span title="Loose engagement root (retention read)">
          Root <strong>{row.retentionRoot ? ROOT_LABELS[row.retentionRoot] : "-"}</strong>
        </span>
      </div>
    </Link>
  );
}
