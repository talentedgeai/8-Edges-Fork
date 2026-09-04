import type { MyCoaching, CommitmentStatus } from "@/lib/coaching/data";
import { OPEN_COMMITMENT_STATUSES } from "@/lib/coaching/data";

// The coachee's own header: the vitals they want before reading anything. Their
// own page, so it names the relationship (with the coach), not a person to look
// up. Server-rendered, so the relative dates resolve once against the clock.

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysFromToday(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function relDay(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

function Tile({
  label,
  value,
  note,
  badge,
  badgeTone = "muted",
  attn = false,
}: {
  label: string;
  value: string;
  note?: string;
  badge?: string;
  badgeTone?: "ok" | "warn" | "info" | "muted";
  attn?: boolean;
}) {
  return (
    <div className={`admin-glance-cell${attn ? " admin-coach-hero__cell--attn" : ""}`}>
      <span className="admin-glance-label">{label}</span>
      <span className="admin-glance-value">{value}</span>
      {(note || badge) && (
        <span className="admin-glance-note admin-coach-hero__note">
          {note}
          {badge && (
            <span className={`admin-badge${badgeTone === "muted" ? "" : ` admin-badge--${badgeTone}`}`}>{badge}</span>
          )}
        </span>
      )}
    </div>
  );
}

export function MyCoachingHeader({ my }: { my: MyCoaching }) {
  const openCommitments = my.commitments.filter((c) =>
    (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
  ).length;
  const activeGoals = my.goals.filter((g) => g.status === "active").length;
  const lastRecap = my.recaps[0] ?? null; // recaps come newest-first
  const awaitingCheckins = my.checkins.filter((c) => !c.respondedAt).length;

  return (
    <header className="admin-coach-hero">
      <div className="admin-eyebrow">Coaching</div>

      <div className="admin-coach-hero__id">
        <div className="admin-coach-hero__id-text">
          <div className="admin-coach-hero__name">My coaching</div>
          <div className="admin-coach-hero__role">
            {my.coachName
              ? `1-1s with ${my.coachName} every ${my.cadenceDays} days · your growth, your goals`
              : "No coach assigned yet. Your goals and commitments are still yours to run."}
          </div>
        </div>
      </div>

      <div className="admin-glance admin-coach-hero__stats">
        <Tile
          label="Next 1-1"
          value={my.nextOneOnOneOn ? fmtDate(my.nextOneOnOneOn) : "Not scheduled"}
          note={my.nextOneOnOneOn ? relDay(daysFromToday(my.nextOneOnOneOn)) : undefined}
          attn
        />
        <Tile
          label="My commitments"
          value={openCommitments === 1 ? "1 open" : `${openCommitments} open`}
          note={openCommitments ? "yours to move" : "all clear"}
        />
        <Tile
          label="FAST goals"
          value={activeGoals === 1 ? "1 active" : `${activeGoals} active`}
          note="your path to promotion"
        />
        <Tile
          label="Last recap"
          value={lastRecap ? fmtDate(lastRecap.heldOn) : "—"}
          note={lastRecap ? undefined : "none yet"}
          badge={lastRecap ? "shared with you" : undefined}
          badgeTone="ok"
        />
        <Tile
          label="Check-in"
          value={awaitingCheckins > 0 ? "Awaiting you" : "Up to date"}
          badge={awaitingCheckins > 0 ? "needs your update" : undefined}
          badgeTone="warn"
        />
      </div>
    </header>
  );
}
