import Link from "next/link";
import type { CoachProfileDetail, CommitmentStatus, OneOnOne } from "@/lib/coaching/data";
import { OPEN_COMMITMENT_STATUSES, RETENTION_ROOT_LABELS } from "@/lib/coaching/data";
import { CoachHeaderActions } from "./CoachHeaderActions";

// The person header: identity plus the six vitals a coach wants before they
// read anything, plus the quick actions. Rendered server-side (relative dates
// resolve once against the server clock, so nothing hydrates out of sync); the
// action buttons are the one client island inside it.

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

type BadgeTone = "ok" | "warn" | "info" | "muted";

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
  badgeTone?: BadgeTone;
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
            <span
              className={`admin-badge${badgeTone === "muted" ? "" : ` admin-badge--${badgeTone}`}`}
            >
              {badge}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function CoachProfileHeader({ detail }: { detail: CoachProfileDetail }) {
  const { member } = detail;

  // Next 1-1 = earliest still-scheduled meeting; last = latest held. Both by
  // status + date only (no clock), so "Next 1-1" here names the same row the
  // meetings list renders highlighted.
  const nextMeeting = detail.meetings
    .filter((m) => m.status === "scheduled")
    .reduce<OneOnOne | null>(
      (earliest, m) => (!earliest || m.heldOn < earliest.heldOn ? m : earliest),
      null,
    );
  const lastMeeting = detail.meetings
    .filter((m) => m.status === "held")
    .reduce<OneOnOne | null>((latest, m) => (!latest || m.heldOn > latest.heldOn ? m : latest), null);

  const open = detail.commitments.filter((c) =>
    (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
  );
  const openThem = open.filter((c) => c.owner === "member").length;
  const openMe = open.filter((c) => c.owner === "coach").length;

  const activeGoals = detail.goals.filter((g) => g.status === "active");
  const draftGoals = detail.goals.filter((g) => g.status === "draft").length;
  const ladderedGoals = activeGoals.filter((g) => g.ladder != null).length;

  const o = detail.ocean;
  const retentionLabel = detail.retentionRoot ? RETENTION_ROOT_LABELS[detail.retentionRoot] : "Not flagged";

  return (
    <header className="admin-coach-hero">
      <Link className="admin-eyebrow admin-coach-hero__back" href="/team/coaching">
        ← Coaching
      </Link>

      <div className="admin-coach-hero__id">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatarUrl} alt="" width={40} height={40} className="admin-coach-avatar" />
        ) : (
          <span className="admin-coach-avatar admin-coach-avatar--empty" aria-hidden>
            {member.name.slice(0, 1)}
          </span>
        )}
        <div className="admin-coach-hero__id-text">
          <div className="admin-coach-hero__name">{member.name}</div>
          <div className="admin-coach-hero__role">
            {member.positionTitle ?? "—"} · 1-1 every {detail.cadenceDays} days
          </div>
        </div>
        <CoachHeaderActions
          profileId={detail.profileId}
          nextMeetingId={nextMeeting?.id ?? null}
          nextHasPrep={Boolean(nextMeeting?.prepMarkdown)}
        />
      </div>

      <div className="admin-glance admin-coach-hero__stats">
        <Tile
          label="Next 1-1"
          value={nextMeeting ? fmtDate(nextMeeting.heldOn) : "None scheduled"}
          note={nextMeeting ? relDay(daysFromToday(nextMeeting.heldOn)) : undefined}
          badge={nextMeeting ? (nextMeeting.prepMarkdown ? "prep ready" : "no prep yet") : undefined}
          badgeTone={nextMeeting?.prepMarkdown ? "ok" : "warn"}
          attn
        />
        <Tile
          label="Last 1-1"
          value={lastMeeting ? fmtDate(lastMeeting.heldOn) : "—"}
          note={lastMeeting ? undefined : "none held yet"}
          badge={
            lastMeeting
              ? lastMeeting.sharedPublishedAt
                ? "recap published"
                : lastMeeting.summaryMarkdown
                  ? "recap draft"
                  : "no recap"
              : undefined
          }
          badgeTone={lastMeeting?.sharedPublishedAt ? "ok" : "warn"}
        />
        <Tile
          label="Open commitments"
          value={open.length === 1 ? "1 open" : `${open.length} open`}
          note={open.length ? `them ${openThem} · me ${openMe}` : "all clear"}
        />
        <Tile
          label="FAST goals"
          value={activeGoals.length === 1 ? "1 active" : `${activeGoals.length} active`}
          note={
            activeGoals.length
              ? ladderedGoals
                ? `${ladderedGoals} laddered to Edges`
                : "quarterly"
              : draftGoals
                ? `${draftGoals} in draft`
                : "none yet"
          }
        />
        <Tile
          label="Retention read"
          value={retentionLabel}
          badge="only you"
          badgeTone="muted"
        />
        <Tile
          label="OCEAN"
          value={o ? (o.published ? "Published" : "Draft") : "Not started"}
          note={o ? (o.published ? "they can read it" : undefined) : undefined}
          badge={o && !o.published ? "only you" : undefined}
          badgeTone="muted"
        />
      </div>
    </header>
  );
}
