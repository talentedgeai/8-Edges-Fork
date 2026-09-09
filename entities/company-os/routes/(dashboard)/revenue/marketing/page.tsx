import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { BarChart } from "@/entities/company-os/ui/charts/BarChart";
import { DonutChart } from "@/entities/company-os/ui/charts/DonutChart";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getAnalyticsOverview, toBars } from "@/entities/company-os/lib/vercel-analytics";
import {
  getAudienceBreakdown,
  getDeliverability,
  getEmailActivity,
  getRecentContacts,
  personaLabel,
  rangeSince,
  type EmailAudience,
  type MarketingRange,
} from "@/entities/company-os/modules/campaigns/marketing";
import {
  WEEKLY_MEETINGS_GOAL,
  getMeetingsBookedThisWeek,
  getNewLeadsCount,
} from "@/entities/company-os/modules/crm/lead-stats";
import { getContentEngine } from "@/entities/company-os/modules/campaigns/marketing-engine";
import { CHANNEL_LABEL } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import {
  KEYNOTE_ATTENDEES_GOAL,
  DOCUMENTED_WORKFLOWS_GOAL,
  getWorkshopAttendeesTotal,
  getDocumentedWorkflowsTotal,
} from "@/entities/library";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { EmailAudienceToggle } from "./EmailAudienceToggle";

// Supabase reads here get frozen by Next's data cache despite force-dynamic;
// the audience and send counts must reflect the CRM as it is right now.
export const metadata: Metadata = {
  title: "Marketing",
  description: "Site traffic, email activity, and the newsletter audience in one place.",
};

const RANGES: { key: MarketingRange; label: string; sub: string }[] = [
  { key: "7d", label: "Last 7 days", sub: "the last 7 days" },
  { key: "30d", label: "Last 30 days", sub: "the last 30 days" },
  { key: "90d", label: "Last 90 days", sub: "the last 90 days" },
  { key: "all", label: "All time", sub: "all time" },
];

function parseRange(value: string | undefined): MarketingRange {
  return value === "7d" || value === "90d" || value === "all" ? value : "30d";
}

// Sales & marketing is the default view. The table's other tab, transactional,
// is the system's own mail (portal invites, board digests, task nudges) and runs
// ~40x the volume of real outreach; defaulting to "all" buried the five sends
// that matter under two hundred that don't.
const DEFAULT_AUDIENCE: EmailAudience = "outbound";

function parseAudience(value: string | undefined): EmailAudience {
  if (value === "all" || value === "transactional") return value;
  return DEFAULT_AUDIENCE;
}

// The by-source chart follows the same filter as the list, so it says which set
// it is showing rather than implying it covers everything.
const BY_SOURCE_LABEL: Record<EmailAudience, string> = {
  all: "Emails sent by source",
  outbound: "Sales & marketing by source",
  transactional: "Transactional by source",
};

const AUDIENCE_EMPTY: Record<EmailAudience, string> = {
  all: "No email sent in this window.",
  outbound:
    "No sales or marketing email in this window. Campaign sends and CRM correspondence land here.",
  transactional: "No transactional email in this window.",
};

// Broadcast (email_campaigns) status, shown as a tone next to the next send.
const BROADCAST_TONE: Record<string, "ok" | "warn" | "err" | "info" | "neutral"> = {
  draft: "info",
  approved: "warn",
  sending: "warn",
  sent: "ok",
  cancelled: "neutral",
};

function formatRate(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function MarketingPage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireAdmin();
  const range = parseRange(firstParam(searchParams.range));
  const emailAudience = parseAudience(firstParam(searchParams.email));
  const active = RANGES.find((r) => r.key === range) ?? RANGES[1];

  const [traffic, email, audience, delivery, newLeads, meetingsBooked, engine, attendees, workflows, recentContacts] =
    await Promise.all([
      getAnalyticsOverview(range, "public"),
      getEmailActivity(range, emailAudience),
      getAudienceBreakdown(),
      getDeliverability(range),
      getNewLeadsCount(rangeSince(range)),
      getMeetingsBookedThisWeek(),
      getContentEngine(),
      getWorkshopAttendeesTotal(),
      getDocumentedWorkflowsTotal(),
      getRecentContacts(5),
    ]);

  // Year goals marketing drives, drawn from the same sources the Edges collector
  // and /api/stats use. Read-only progress against annual targets.
  const yearGoals = [
    {
      label: "Keynote attendees",
      value: attendees,
      target: KEYNOTE_ATTENDEES_GOAL,
    },
    {
      label: "Documented workflows",
      value: workflows,
      target: DOCUMENTED_WORKFLOWS_GOAL,
    },
  ];

  const trafficError = "error" in traffic ? traffic.error : null;
  const totals = "error" in traffic ? null : traffic.totals;

  return (
    <div>
      <PageHead
        eyebrow="Revenue"
        title="Marketing"
        sub={`The funnel from site traffic to booked meetings, plus email activity, ${active.sub}.`}
      />

      <div className="admin-tabs u-mb-4" role="tablist">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={r.key === "30d" ? "/admin/revenue/marketing" : `/admin/revenue/marketing?range=${r.key}`}
            role="tab"
            aria-selected={r.key === range}
            className={`admin-tab${r.key === range ? " is-active" : ""} u-link-plain`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* The funnel, left to right: attention in, meetings out. Page views now
          live in the traffic section's coverage line, and total emails sent in
          the Recent email toggle, so nothing here is lost. */}
      <div className="admin-kpi-grid">
        <MetricCard
          label="Visitors"
          value={totals ? totals.visitors.toLocaleString() : "—"}
          sub={trafficError ? "Vercel Analytics unavailable" : "unique, public site only"}
        />
        <MetricCard
          label="Newsletter audience"
          value={audience.eligible.toLocaleString()}
          sub={`of ${audience.total.toLocaleString()} contacts`}
        />
        <MetricCard
          label="New leads"
          value={newLeads.toLocaleString()}
          sub={active.sub}
          href="/admin/revenue/leads"
        />
        <MetricCard
          label="Meetings booked"
          value={`${meetingsBooked} / ${WEEKLY_MEETINGS_GOAL}`}
          sub="this week vs goal"
          href="/admin/revenue/leads"
        />
      </div>

      {trafficError && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {trafficError}
        </div>
      )}
      {email.error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          Email activity: {email.error}
        </div>
      )}
      {audience.error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          Audience: {audience.error}
        </div>
      )}

      <section className="admin-card admin-section-card">
        <div
          className="u-row u-gap-3 u-between u-wrap"
        >
          <div className="admin-card-title">Content engine</div>
          <Link className="admin-btn" href="/admin/revenue/marketing/campaigns">
            Open campaigns
          </Link>
        </div>
        <p className="admin-page-sub u-mt-1">
          Every campaign asset by stage, the campaigns in flight, and the next email to go out.{" "}
          {engine.pipelineTotal.toLocaleString()} asset
          {engine.pipelineTotal === 1 ? "" : "s"} in the pipeline.
        </p>

        <div className="admin-summary-pills u-mt-3 u-mb-1">
          {engine.stages.map((s) => (
            <Link key={s.id} className="admin-pill" href="/admin/revenue/marketing/campaigns">
              <span className="admin-pill-label">{s.label}</span>
              <span className="admin-pill-val">{s.count.toLocaleString()}</span>
            </Link>
          ))}
        </div>

        <div
          className="admin-summary-grid u-mt-3 u-grid-2"
        >
          <div className="admin-card admin-chart-card">
            <div
              className="u-row u-between"
            >
              <div className="admin-kpi-label">Active campaigns</div>
              <Link href="/admin/revenue/marketing/campaigns" className="admin-cell-muted">
                See all
              </Link>
            </div>
            {engine.activeCampaigns.length === 0 ? (
              <div className="admin-empty u-mt-3">
                No active campaigns. Start one on the campaigns page.
              </div>
            ) : (
              <div className="u-stack u-gap-4 u-mt-3">
                {engine.activeCampaigns.map((c) => {
                  const pct = c.assetCount === 0 ? 0 : Math.round((c.builtCount / c.assetCount) * 100);
                  return (
                    <div key={c.id}>
                      <div
                        className="u-row u-between"
                      >
                        <Link
                          href={`/admin/revenue/marketing/campaigns/${c.id}`}
                          className="admin-cell-strong"
                        >
                          {c.name}
                        </Link>
                        <span className="admin-cell-muted u-nowrap">
                          {c.builtCount} / {c.assetCount} built
                        </span>
                      </div>
                      <div
                        className="u-mt-2 admin-meter"
                      >
                        <div
                          style={{ /* layout-ok: data-driven progress width */
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 20,
                            background: "var(--admin-accent)",
                          }}
                        />
                      </div>
                      {c.channels.length > 0 && (
                        <div className="u-row u-wrap u-mt-2">
                          {c.channels.map((ch) => (
                            <span key={ch} className="admin-chip">
                              {CHANNEL_LABEL[ch]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="admin-card admin-chart-card">
            <div
              className="u-row u-between"
            >
              <div className="admin-kpi-label">Next broadcast</div>
              <Link href="/admin/revenue/marketing/broadcasts" className="admin-cell-muted">
                See all
              </Link>
            </div>
            {engine.nextBroadcast === null ? (
              <div className="admin-empty u-mt-3">
                Nothing queued. Draft one on the broadcasts page.
              </div>
            ) : (
              <div className="u-mt-3">
                <Link
                  href={`/admin/revenue/marketing/broadcasts/${engine.nextBroadcast.id}`}
                  className="admin-cell-strong"
                >
                  {engine.nextBroadcast.name}
                </Link>
                <div className="u-row u-mt-2">
                  <Badge tone={BROADCAST_TONE[engine.nextBroadcast.status] ?? "neutral"}>
                    {engine.nextBroadcast.status}
                  </Badge>
                  <span className="admin-cell-muted">
                    {engine.nextBroadcast.scheduledAt
                      ? `scheduled ${formatDate(engine.nextBroadcast.scheduledAt)}`
                      : "not scheduled yet"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Year goals</div>
        <p className="admin-page-sub u-mt-1">
          The annual targets marketing drives, from the same source the Edges scoreboard reads.
        </p>
        <div className="u-stack u-gap-4 u-mt-4">
          {yearGoals.map((g) => {
            const pct =
              g.value === null ? 0 : Math.min(100, Math.round((g.value / g.target) * 100));
            return (
              <div key={g.label}>
                <div
                  className="u-row u-between"
                >
                  <span className="admin-cell-strong">{g.label}</span>
                  <span
                    className="admin-cell-muted u-nowrap u-tabular"
                  >
                    {g.value === null
                      ? "—"
                      : `${g.value.toLocaleString()} / ${g.target.toLocaleString()}`}
                  </span>
                </div>
                <div
                  className="u-mt-2 admin-meter admin-meter--thick"
                >
                  <div
                    style={{ /* layout-ok: data-driven progress width */
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 20,
                      background: "var(--admin-accent)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Public site traffic</div>
        <p className="admin-page-sub u-mt-1">
          The marketing site only. Company OS (admin, team, and client portal) is excluded, since
          the team using the internal app is not audience reach.{" "}
          {!("error" in traffic) && traffic.coverage.totalPageviews > 0 && (
            <>
              These pages cover{" "}
              {Math.round(
                (traffic.coverage.shownPageviews / traffic.coverage.totalPageviews) * 100,
              )}
              % of {traffic.coverage.totalPageviews.toLocaleString()} public page views.{" "}
            </>
          )}
          <Link href="/admin/operations/analytics?segment=internal">See Company OS usage</Link>.
        </p>

        {!("error" in traffic) && traffic.byChannel.length > 0 && (
          <>
            <div className="admin-summary-pills u-mt-3 u-mb-1">
              {traffic.byChannel.map((c) => (
                <div key={c.label} className="admin-pill">
                  <span className="admin-pill-label">{c.label}</span>
                  <span className="admin-pill-val">{c.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="admin-hint">
              Traffic grouped by referrer. Social is a floor: links opened from apps and DMs arrive
              without a referrer and count as Direct. Precise per-post attribution needs UTM tags on
              the links we post (a planned follow-up).
            </div>
          </>
        )}

        <div
          className="admin-summary-grid u-mt-3 u-grid-3"
        >
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">Top pages</div>
            <BarChart
              data={"error" in traffic ? [] : toBars(traffic.topPages)}
              ariaLabel="Top pages by page views"
              emptyText="No traffic data."
              stacked
            />
          </div>
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">Top referrers</div>
            <BarChart
              data={"error" in traffic ? [] : toBars(traffic.topReferrers)}
              ariaLabel="Top referrers by page views"
              emptyText="No referrer data."
              stacked
            />
          </div>
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">Content by pillar</div>
            <BarChart
              data={engine.contentByPillar}
              ariaLabel="Calendar content by pillar"
              emptyText="No content on the calendar yet."
              stacked
            />
          </div>
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Email health</div>
        <p className="admin-page-sub u-mt-1">
          {audience.eligible.toLocaleString()} of {audience.total.toLocaleString()} contacts can receive
          marketing email. {audience.neverAsked.toLocaleString()} have never been asked,{" "}
          {audience.unsubscribed.toLocaleString()} opted out, and{" "}
          {audience.doNotContact.toLocaleString()}{" "}
          {audience.doNotContact === 1 ? "person is" : "people are"} marked do-not-contact. Job
          seekers are excluded structurally.
        </p>
        <div
          className="admin-summary-grid u-mt-3 u-grid-3"
        >
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">Contacts by persona</div>
            <DonutChart
              data={audience.byPersona}
              centerLabel={`${audience.total.toLocaleString()} contacts`}
              ariaLabel="Contacts by persona"
              neutralLabel="Unset"
              emptyText="No contacts."
            />
          </div>
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">{BY_SOURCE_LABEL[emailAudience]}</div>
            <BarChart
              data={email.bySource}
              ariaLabel={BY_SOURCE_LABEL[emailAudience]}
              emptyText={AUDIENCE_EMPTY[emailAudience]}
              stacked
            />
            {email.breakdownTruncated && (
              <div className="admin-hint u-mt-2">
                Based on the most recent sends in this window, not all
                {" "}
                {email.total.toLocaleString()}.
              </div>
            )}
          </div>
          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">Deliverability</div>
            {delivery.error ? (
              <div className="admin-alert admin-alert--err u-mt-3">
                {delivery.error}
              </div>
            ) : !delivery.hasData ? (
              <div className="admin-empty u-mt-3">
                No delivery data yet. Register the Resend webhook at{" "}
                <code>https://www.edge8.ai/api/webhooks/resend/</code> (trailing slash required) and
                set <code>RESEND_WEBHOOK_SECRET</code>. Events accrue from that point forward.
              </div>
            ) : (
              <div className="u-stack u-gap-3 u-mt-3">
                {[
                  { label: "Delivered", value: delivery.deliveryRate },
                  { label: "Bounced", value: delivery.bounceRate },
                  { label: "Opened", value: delivery.openRate },
                  { label: "Clicked", value: delivery.clickRate },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="u-row u-between"
                  >
                    <span className="admin-cell-muted">{r.label}</span>
                    <span
                      className="admin-cell-strong u-tabular"
                    >
                      {formatRate(r.value)}
                    </span>
                  </div>
                ))}
                {delivery.bounceRate !== null && delivery.bounceRate > 5 && (
                  <div className="admin-hint u-err">
                    Bounce rate over 5%, clean the list.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {delivery.hasData && delivery.problems.length > 0 && (
          <div className="admin-table-wrap u-mt-4">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Problem</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {delivery.problems.map((row) => (
                    <tr key={`${row.recipient}-${row.occurredAt}-${row.eventType}`}>
                      <td className="admin-cell-strong">
                        {row.personId ? (
                          <Link href={`/admin/contacts/${row.personId}`}>{row.recipient}</Link>
                        ) : (
                          row.recipient
                        )}
                      </td>
                      <td>
                        <span
                          className={`admin-badge admin-badge--${row.eventType === "complained" ? "err" : "warn"}`}
                        >
                          {row.eventType === "complained" ? "Marked as spam" : "Bounced"}
                        </span>
                      </td>
                      <td className="admin-cell-mono">{formatDate(row.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <div className="admin-card-title">New contacts</div>
          <Link href="/admin/contacts" className="admin-cell-muted">
            See all
          </Link>
        </div>
        {recentContacts.error && (
          <div className="admin-alert admin-alert--err u-mt-3">
            Contacts: {recentContacts.error}
          </div>
        )}
        <div className="admin-table-wrap u-mt-3">
          {recentContacts.rows.length === 0 ? (
            <div className="admin-empty">No contacts yet.</div>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Added</th>
                    <th>Name</th>
                    <th>Persona</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recentContacts.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-cell-mono">{formatDate(row.createdAt)}</td>
                      <td className="admin-cell-strong">
                        <Link href={`/admin/contacts/${row.id}`}>{row.name}</Link>
                      </td>
                      <td>
                        {row.persona ? (
                          <Badge>{personaLabel(row.persona)}</Badge>
                        ) : (
                          <span className="admin-cell-muted">—</span>
                        )}
                      </td>
                      <td className="admin-cell-muted">{row.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div
          className="u-row u-gap-3 u-between u-wrap"
        >
          <div className="admin-card-title">Recent email</div>
          <EmailAudienceToggle
            active={emailAudience}
            defaultAudience={DEFAULT_AUDIENCE}
            counts={email.counts}
            searchParams={searchParams}
          />
        </div>
        <div className="admin-table-wrap u-mt-3">
          {email.recent.length === 0 ? (
            <div className="admin-empty">{AUDIENCE_EMPTY[emailAudience]}</div>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Subject</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {email.recent.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-cell-mono">{formatDate(row.occurredAt)}</td>
                      <td className="admin-cell-strong">{row.subject || "(no subject)"}</td>
                      <td>
                        {row.personId ? (
                          <Link href={`/admin/contacts/${row.personId}`}>{row.personName || row.to}</Link>
                        ) : (
                          <span className="admin-cell-muted">{row.to || "—"}</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={row.kind === "outbound" ? "info" : "neutral"}>{row.kindLabel}</Badge>
                      </td>
                      <td className="admin-cell-muted">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
