import Link from "next/link";
import { requirePortalMember } from "@/lib/portal-auth";
import { getAssignedTeam } from "@/lib/portal/team";
import { getAssignedTimeOff, getLeaveDecisionQueue } from "@/lib/portal/time-off";
import { getInvoicesForActor } from "@/lib/portal/invoices";
import { listWorkRequestsForActor } from "@/lib/portal/work-requests";
import { getMyEvents } from "@/lib/portal/events";
import { getTokenBalance } from "@/lib/portal/tokens";
import { getRoadmapPreviewForActor } from "@/lib/portal/backlog";
import { getBoardForClient } from "@/lib/portal/boards";
import { listDocumentsForActor } from "@/lib/portal/documents";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { PRIORITY_LABEL, type BacklogPriority } from "@/lib/client-backlog";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { formatHours } from "@/lib/admin/contractors";

import { PRIORITY_LABEL as TASK_LABEL, PRIORITY_TONE as TASK_TONE } from "@/lib/boards/types";

const PRIORITY_TONE: Record<BacklogPriority, BadgeTone> = {
  now: "info",
  next: "ok",
  later: "neutral",
  park: "warn",
};

export const dynamic = "force-dynamic";

// Portal home. Job in one line: answer "does anything need me?" in five seconds,
// then route into the modules. Every section is self-scoped by construction —
// every helper below is bound to the actor's companyScope / assignment scope, so
// this page adds no new data-access surface, only new composition. It renders
// nothing it has no data for: a brand-new client still lands on the stat tiles +
// quick actions, never an empty shell. Plan: docs/plans/2026-07-18-portal-home-build-plan.md

function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function timeOffRange(start: string, end: string, half: boolean): string {
  const label = start === end ? formatDate(start) : `${formatDate(start)} → ${formatDate(end)}`;
  return half ? `${label} · half day` : label;
}

function eventRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Date to be confirmed";
  const start = formatDate(startsAt);
  if (!endsAt || endsAt === startsAt) return start;
  return `${start} → ${formatDate(endsAt)}`;
}

export default async function PortalHome() {
  const actor = await requirePortalMember();

  const [team, timeOff, leaveDecisions, invoices, requests, events, tokens, roadmap, board, documents] =
    await Promise.all([
      getAssignedTeam(actor),
      getAssignedTimeOff(actor),
      getLeaveDecisionQueue(actor),
      getInvoicesForActor(actor),
      listWorkRequestsForActor(actor),
      getMyEvents(actor),
      getTokenBalance(actor),
      getRoadmapPreviewForActor(actor, 3),
      getBoardForClient(actor),
      listDocumentsForActor(actor),
    ]);

  const firstName = actor.displayName.split(/\s+/)[0] || actor.displayName;
  const companies = actor.memberships.map((m) => m.companyName).filter(Boolean) as string[];

  const hasStaff = team.length > 0;
  const today = isoDay(0);
  const weekEnd = isoDay(7);
  // A leave overlaps "this week" iff it starts on/before the window's end and
  // ends on/after today. Dates are YYYY-MM-DD, so lexical compare is date compare.
  const outThisWeek = timeOff.filter((e) => e.startDate <= weekEnd && e.endDate >= today);

  // Actionable = blocked on the CLIENT. estimate_submitted / work_submitted are
  // the two states where the contractor is waiting on this person to decide.
  const needsDecision = requests.filter(
    (r) => r.status === "estimate_submitted" || r.status === "work_submitted",
  );
  // Moving, but on Edge8's side — surfaced as a count, not a card. Draft is the
  // client's own unsent request, so it is neither "yours to action" nor "ours".
  const inProgress = requests.filter((r) =>
    ["awaiting_estimate", "changes_requested", "approved"].includes(r.status),
  );
  const openRequestCount = requests.filter(
    (r) => !["completed", "cancelled", "rejected", "draft"].includes(r.status),
  ).length;

  const openInvoices = invoices.filter((inv) => inv.balanceCents > 0);
  const openTotal = openInvoices.reduce((sum, inv) => sum + inv.balanceCents, 0);
  const openCurrency = openInvoices[0]?.currency ?? "usd";

  const upcomingEvents = events
    .filter((e) => e.startsAt && e.startsAt.slice(0, 10) >= today && e.status !== "cancelled")
    .sort((a, b) => (a.startsAt! < b.startsAt! ? -1 : 1));
  const nextEvent = upcomingEvents[0] ?? null;

  // Leave waiting on this person to decide. Empty unless they are named as
  // client manager on an active placement, so it adds no surface for anyone
  // else (lib/portal/time-off.ts).
  const hasAttention =
    openInvoices.length > 0 || needsDecision.length > 0 || leaveDecisions.length > 0;

  // Delivery at a glance: the three views shared with the team client hub.
  const openCards = (board?.cards ?? []).filter((c) => !c.done);
  const columnName = new Map((board?.columns ?? []).map((c) => [c.id, c.name]));
  const latestDocs = documents.slice(0, 3);
  const hasGlance = roadmap.total > 0 || board !== null || documents.length > 0;

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title={`Welcome, ${firstName}`}
        sub={companies.length > 0 ? companies.join(" · ") : undefined}
      />

      {hasGlance && (
        <div className="admin-team-glance u-mb-4">
          <div className="admin-team-glance-cell">
            <span className="admin-team-glance-label">Roadmap</span>
            <span className="admin-team-glance-value">
              {roadmap.total > 0 ? `${roadmap.total} item${roadmap.total === 1 ? "" : "s"}` : "None yet"}
            </span>
            <span className="admin-team-glance-note">
              {roadmap.total > 0 ? <Link href="/portal/hub">Open →</Link> : "Built with Edge8"}
            </span>
          </div>
          <div className="admin-team-glance-cell">
            <span className="admin-team-glance-label">Work Board</span>
            <span className="admin-team-glance-value">
              {board ? `${openCards.length} open card${openCards.length === 1 ? "" : "s"}` : "No board yet"}
            </span>
            <span className="admin-team-glance-note">
              {board ? <Link href="/portal/hub">Open →</Link> : "Set up by Edge8"}
            </span>
          </div>
          <div className="admin-team-glance-cell">
            <span className="admin-team-glance-label">Documents</span>
            <span className="admin-team-glance-value">
              {documents.length === 0 ? "None yet" : `${documents.length} file${documents.length === 1 ? "" : "s"}`}
            </span>
            <span className="admin-team-glance-note">
              <Link href="/portal/hub">{documents.length > 0 ? "Open →" : "Upload →"}</Link>
            </span>
          </div>
        </div>
      )}

      {hasAttention && (
        <div className="admin-card admin-section-card admin-card--attention u-mb-4">
          <h2 className="admin-card-title u-mb-3">
            Needs your attention
          </h2>
          <div className="admin-list">
            {openInvoices.map((inv) => {
              const overdue = !!inv.dueDate && inv.dueDate.slice(0, 10) < today;
              return (
                <div className="admin-list-row" key={inv.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">
                      Invoice {inv.docNumber || inv.id.slice(0, 8)}
                    </div>
                    <div className="admin-list-sub">
                      {formatCents(inv.balanceCents, inv.currency)}{" "}
                      {overdue
                        ? `overdue since ${formatDate(inv.dueDate)}`
                        : inv.dueDate
                          ? `due ${formatDate(inv.dueDate)}`
                          : "outstanding"}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone={overdue ? "err" : "warn"}>{overdue ? "Overdue" : "Due"}</Badge>
                    {inv.paymentLink ? (
                      <a
                        className="admin-btn admin-btn--sm admin-btn--primary"
                        href={inv.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Pay now
                      </a>
                    ) : (
                      <Link className="admin-btn admin-btn--sm" href="/portal/invoices">
                        View
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}

            {leaveDecisions.map((r) => (
              <Link
                className="admin-list-row u-link-plain"
                key={r.id}
                href="/portal/time-off"
              >
                <div className="admin-list-main">
                  <div className="admin-list-title">{r.fullName || "Team member"} requested time off</div>
                  <div className="admin-list-sub">
                    {timeOffRange(r.startDate, r.endDate, r.isHalfDay)}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone="warn">Approve leave</Badge>
                </div>
              </Link>
            ))}

            {needsDecision.map((r) => (
              <Link
                className="admin-list-row u-link-plain"
                key={r.id}
                href={`/portal/requests/${r.id}`}
              >
                <div className="admin-list-main">
                  <div className="admin-list-title">{r.title}</div>
                  <div className="admin-list-sub">
                    {r.status === "estimate_submitted"
                      ? `${r.contractorName || "Your contractor"} sent an estimate${
                          r.estimatedHours != null ? ` · est ${formatHours(r.estimatedHours)}` : ""
                        }`
                      : `${r.contractorName || "Your contractor"} delivered the work${
                          r.actualHours != null ? ` · ${formatHours(r.actualHours)}` : ""
                        }`}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone="warn">
                    {r.status === "estimate_submitted" ? "Approve estimate" : "Review & accept"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>

          {inProgress.length > 0 && (
            <p className="admin-page-sub u-mt-3 u-mb-0">
              {inProgress.length} more {inProgress.length === 1 ? "request is" : "requests are"} in
              progress with Edge8. <Link href="/portal/requests">View all</Link>
            </p>
          )}
        </div>
      )}

      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Token balance"
          value={tokens.balanceTokens}
          sub={
            tokens.pendingTokens > 0 ? `${tokens.pendingTokens} processing` : "hours of skilled work"
          }
          href="/portal/tokens"
        />
        <MetricCard
          label="Open requests"
          value={openRequestCount}
          sub="in flight"
          href="/portal/requests"
        />
        {hasStaff && (
          <MetricCard
            label="Your team"
            value={team.length}
            sub={team.length === 1 ? "dedicated person" : "dedicated people"}
            href="/portal/team"
          />
        )}
        {invoices.length > 0 && (
          <MetricCard
            label="Outstanding"
            value={openTotal > 0 ? formatCents(openTotal, openCurrency) : "Paid up"}
            sub={openTotal > 0 ? `${openInvoices.length} open` : "all settled"}
            href="/portal/invoices"
          />
        )}
        {events.length > 0 && (
          <MetricCard
            label="Upcoming events"
            value={upcomingEvents.length}
            sub="registered"
            href="/portal/events"
          />
        )}
      </div>

      {(roadmap.total > 0 || openCards.length > 0 || latestDocs.length > 0 || hasStaff || nextEvent) && (
        <h2 className="admin-section-label">Your engagement</h2>
      )}

      {roadmap.total > 0 && (
        <div className="admin-card admin-section-card u-mb-4">
          <div
            className="u-row u-between u-mb-3"
          >
            <h2 className="admin-card-title">
              Roadmap
              <span className="admin-cell-muted u-ml-2 u-sm">
                next up
              </span>
            </h2>
            <Link href="/portal/hub" className="admin-cell-muted u-sm">
              View all {roadmap.total} →
            </Link>
          </div>
          <div className="admin-list">
            {roadmap.items.map((it) => (
              <Link
                key={it.id}
                href="/portal/hub"
                className="admin-list-row u-link-plain"
              >
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {it.ref ? `${it.ref} · ` : ""}
                    {it.title}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABEL[it.priority]}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {board && openCards.length > 0 && (
        <div className="admin-card admin-section-card u-mb-4">
          <div className="admin-card-head">
            <h2 className="admin-card-title">
              Work Board
              <span className="admin-cell-muted u-sm u-ml-2">
                in motion
              </span>
            </h2>
            <Link href="/portal/hub" className="admin-cell-muted u-sm">
              View board →
            </Link>
          </div>
          <div className="admin-list">
            {openCards.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                href="/portal/hub"
                className="admin-list-row u-link-plain"
              >
                <div className="admin-list-main">
                  <div className="admin-list-title">{c.title}</div>
                  {c.columnId && columnName.get(c.columnId) && (
                    <div className="admin-list-sub">{columnName.get(c.columnId)}</div>
                  )}
                </div>
                <div className="admin-list-aside">
                  <Badge tone={TASK_TONE[c.priority] ?? "neutral"}>{TASK_LABEL[c.priority] ?? c.priority}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {latestDocs.length > 0 && (
        <div className="admin-card admin-section-card u-mb-4">
          <div className="admin-card-head">
            <h2 className="admin-card-title">
              Latest documents
            </h2>
            <Link href="/portal/hub" className="admin-cell-muted u-sm">
              All {documents.length} →
            </Link>
          </div>
          <div className="admin-list">
            {latestDocs.map((d) => {
              const ext = d.filename.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1]?.toUpperCase() ?? null;
              return (
                <div className="admin-list-row" key={d.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">{d.filename}</div>
                    <div className="admin-list-sub">
                      {formatDate(d.createdAt)}
                      {(d.uploaderName || d.uploadedBy) && ` · ${d.uploaderName ?? d.uploadedBy}`}
                    </div>
                  </div>
                  {ext && (
                    <div className="admin-list-aside">
                      <Badge tone="info">{ext}</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasStaff && (
        <div className="admin-card admin-section-card u-mb-4">
          <div className="admin-card-head">
            <h2 className="admin-card-title">
              This week
            </h2>
            <Link href="/portal/time-off" className="admin-cell-muted u-sm">
              Time off →
            </Link>
          </div>
          {outThisWeek.length === 0 ? (
            <p className="admin-page-sub u-m-0">
              Your whole team is in this week.
            </p>
          ) : (
            <div className="admin-list">
              {outThisWeek.map((e) => (
                <div className="admin-list-row" key={e.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">{e.fullName || "Team member"}</div>
                    <div className="admin-list-sub">{humanize(e.leaveType)}</div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-cell-muted u-sm">
                      {timeOffRange(e.startDate, e.endDate, e.isHalfDay)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {nextEvent && (
        <div className="admin-card admin-section-card u-mb-4">
          <div className="u-row-top u-wrap u-between">
            <div>
              <div className="admin-eyebrow u-mb-1">
                Next event
              </div>
              <h2 className="admin-card-title u-mb-1">
                {nextEvent.eventTitle || "Event"}
              </h2>
              <div className="admin-cell-muted">
                {eventRange(nextEvent.startsAt, nextEvent.endsAt)}
                {nextEvent.location ? ` · ${nextEvent.location}` : ""}
                {nextEvent.tierTitle ? ` · ${nextEvent.tierTitle}` : ""}
              </div>
            </div>
            <Badge tone="ok">{humanize(nextEvent.status)}</Badge>
          </div>
        </div>
      )}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">
          Quick actions
        </h2>
        <div className="u-row u-wrap">
          <Link href="/portal/requests/new" className="admin-btn admin-btn--primary">
            New project request
          </Link>
          <Link href="/portal/requests/hire" className="admin-btn">
            Full-time hire estimate
          </Link>
          <Link href="/portal/tokens" className="admin-btn">
            Buy tokens
          </Link>
          <Link href="/portal/referrals" className="admin-btn">
            Refer &amp; earn
          </Link>
        </div>
      </div>
    </>
  );
}
