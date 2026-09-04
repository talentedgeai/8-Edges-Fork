import { Suspense } from "react";
import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { STAGE_WON, STAGE_LOST, STAGE_NEUTRAL } from "@/lib/admin/stageColors";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { Band } from "@/components/admin/Band";
import { BarChart } from "@/components/admin/charts/BarChart";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { formatCents, formatDate, timeAgo } from "@/lib/admin/format";
import { compactUsd, vsPrior, monthsThisYear, MS_DAY } from "@/lib/admin/dashboard-helpers";
import { getSurveyScore } from "@/lib/admin/survey-scores";
import { getAnalyticsOverview } from "@/lib/admin/vercel-analytics";
import { getAudienceBreakdown, getDeliverability } from "@/lib/admin/marketing";
import { getContentEngine } from "@/lib/admin/marketing-engine";
import { WEEKLY_MEETINGS_GOAL, getMeetingsBookedThisWeek } from "@/lib/admin/lead-stats";
import { ACTIVE_LEAD_STATUSES } from "@/lib/lifecycle";
import { CockpitDeals } from "./CockpitDeals";
import type { DealCard } from "./deals/DealsBoard";
import { HANDOFF_COLUMN_ID } from "./deals/constants";
import type { KanbanColumn } from "@/components/admin/KanbanBoard";
import { one, type Embedded } from "@/lib/embedded";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Revenue cockpit",
  description: "The whole revenue engine on one screen: sales, marketing, and (soon) customer success.",
};

// The Marketing band leans on the external Vercel Analytics API (visitors +
// traffic by channel), so it streams in its own boundary rather than gating the
// DB-backed sales section above. The DB-derived marketing numbers (audience,
// email opens, campaigns) are passed in already-resolved.
async function MarketingSection({
  audience,
  openedEmails,
  openRate,
  activeCampaigns,
}: {
  audience: { total: number; eligible: number };
  openedEmails: number;
  openRate: number | null;
  activeCampaigns: { id: string; title: string | null; status: string | null }[];
}) {
  const analytics = await getAnalyticsOverview("30d", "public");
  const visitors = "error" in analytics ? null : analytics.totals.visitors;
  const byChannel = "error" in analytics ? [] : analytics.byChannel;

  return (
    <>
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Visitors · 30d"
          value={visitors != null ? visitors.toLocaleString("en-US") : "—"}
          sub="unique, public site"
          href="/admin/revenue/marketing"
        />
        <MetricCard
          label="Newsletter audience"
          value={audience.eligible.toLocaleString("en-US")}
          sub={`of ${audience.total.toLocaleString("en-US")} contacts`}
          href="/admin/revenue/marketing"
        />
        <MetricCard
          label="Emails opened · 30d"
          value={openedEmails.toLocaleString("en-US")}
          sub={openRate != null ? `${openRate.toFixed(0)}% open rate` : "no email activity yet"}
          href="/admin/revenue/marketing"
        />
        <MetricCard
          label="Active campaigns"
          value={activeCampaigns.length}
          sub="in flight"
          href="/admin/revenue/marketing/campaigns"
        />
      </div>
      <div className="admin-summary-grid u-mb-1">
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Traffic by channel · 30d</div>
          <DonutChart data={byChannel} centerLabel="visits" ariaLabel="Public site traffic by channel" emptyText="No traffic data." />
        </div>
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Active campaigns</div>
          {activeCampaigns.length === 0 ? (
            <div className="admin-empty">Nothing in flight.</div>
          ) : (
            <div className="admin-list">
              {activeCampaigns.slice(0, 6).map((c) => (
                <div key={c.id} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{c.title || "Untitled campaign"}</div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-list-sub">{(c.status ?? "").replace(/_/g, " ")}</span>
                  </div>
                </div>
              ))}
              <div className="u-pt-3">
                <Link href="/admin/revenue/marketing/campaigns" className="admin-auth-link">Open campaigns →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function MarketingSectionFallback() {
  return (
    <div className="admin-kpi-grid u-mb-4">
      <MetricCard label="Visitors · 30d" value="…" sub="unique, public site" />
      <MetricCard label="Newsletter audience" value="…" sub="loading" />
      <MetricCard label="Emails opened · 30d" value="…" sub="loading" />
      <MetricCard label="Active campaigns" value="…" sub="loading" />
    </div>
  );
}

// The Revenue office landing: a sales command center. Every open deal is checked
// for the four things a rep needs to act — an owner, a value, a next step, and a
// date — and anything missing is surfaced up top so nothing dies silently.

// Inquiry types that are NOT inbound sales contact (events, commerce, legacy import).
const NON_SALES_INQUIRY_TYPES = "(general,retreat,trip,checkout,newsletter)";

type Stage = { id: string; name: string; is_won: boolean; is_lost: boolean };
type DealRow = {
  id: string;
  title: string | null;
  stage_id: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  owner_id: string | null;
  status: string | null;
  source: string | null;
  expected_close_date: string | null;
  next_step: string | null;
  next_step_date: string | null;
  proposal_url: string | null;
  contract_url: string | null;
  handoff_status: string | null;
  lost_reason: string | null;
  probability: number | null;
  person_id: string | null;
  updated_at: string | null;
  referrer_id: string | null;
  referrer_company_id: string | null;
  people: Embedded<{ full_name: string | null; email: string }>;
  companies: Embedded<{ name: string | null }>;
  referrer: Embedded<{ full_name: string | null; email: string }>;
  referrer_company: Embedded<{ name: string | null }>;
};
type LeadRow = {
  id: string;
  full_name: string | null;
  email: string;
  lead_status: string | null;
  lead_sla_due_at: string | null;
  created_at: string;
};
// Raw shape from the lead satellite join; flattened into LeadRow after fetch.
type LeadRawRow = {
  status: string | null;
  sla_due_at: string | null;
  created_at: string;
  people: { id: string; full_name: string | null; email: string } | null;
};
type InquiryRow = {
  id: string;
  subject: string | null;
  type: string | null;
  created_at: string;
  people: Embedded<{ full_name: string | null; email: string }>;
};

function dealGaps(d: DealRow): string[] {
  const gaps: string[] = [];
  if (!d.owner_id) gaps.push("Owner");
  if (!d.amount_usd_cents) gaps.push("Value");
  if (!d.next_step) gaps.push("Next step");
  if (!d.next_step_date) gaps.push("Date");
  return gaps;
}

type InvoiceRow = { txn_date: string | null; amount_cents: number | null; balance_cents: number | null; status: string | null; entity: string };
type OrderRow = { created_at: string; amount_usd_cents: number | null; status: string | null };
type FunnelDealRow = { status: string | null; created_at: string; closed_at: string | null };

export default async function SalesCockpitPage() {
  const now = new Date();
  const nowIso = now.toISOString();
  const year = now.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const tomorrow = new Date(now.getTime() + MS_DAY).toISOString().slice(0, 10);
  const date30 = new Date(now.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  const date365 = new Date(now.getTime() - 365 * MS_DAY).toISOString().slice(0, 10);
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  const iso60 = new Date(now.getTime() - 60 * MS_DAY).toISOString();
  const iso90 = new Date(now.getTime() - 90 * MS_DAY).toISOString();

  let dealsQuery = companyOs
    .from("deals")
    .select(
      "id, title, stage_id, amount_cents, amount_usd_cents, currency, owner_id, status, source, expected_close_date, next_step, next_step_date, proposal_url, contract_url, handoff_status, lost_reason, probability, person_id, updated_at, referrer_id, referrer_company_id, people!person_id(full_name, email), companies!company_id(name), referrer:people!referrer_id(full_name, email), referrer_company:companies!referrer_company_id(name)",
    )
    .eq("status", "open")
    .is("archived_at", null)
    .limit(500);

  let inqQuery = companyOs
    .from("inquiries")
    .select("id, subject, type, created_at, people(full_name, email)")
    .eq("status", "new_lead")
    .not("type", "in", NON_SALES_INQUIRY_TYPES)
    .order("created_at", { ascending: false })
    .limit(50);

  const [
    stagesRes,
    dealsRes,
    leadsRes,
    inqRes,
    overdueRes,
    wonRes,
    invoicesRes,
    ordersRes,
    funnelDealsRes,
    newLeadsRes,
    inq30Res,
    clientScore,
    audience,
    delivery,
    engine,
    meetingsBooked,
  ] = await Promise.all([
    companyOs.from("pipeline_stages").select("id, name, is_won, is_lost").order("position"),
    dealsQuery,
    companyOs
      .from("lead")
      .select("status, sla_due_at, created_at, people!person_id!inner(id, full_name, email, archived_at)")
      .in("status", ACTIVE_LEAD_STATUSES)
      .is("people.archived_at", null)
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(50),
    inqQuery,
    companyOs
      .from("lead")
      .select("person_id, people!person_id!inner(id)", { count: "exact", head: true })
      .in("status", ACTIVE_LEAD_STATUSES)
      .is("people.archived_at", null)
      .not("sla_due_at", "is", null)
      .lt("sla_due_at", nowIso),
    companyOs
      .from("deals")
      .select("amount_usd_cents")
      .eq("status", "won")
      .is("archived_at", null)
      .gte("closed_at", "2026-01-01")
      .lt("closed_at", "2027-01-01"),
    // Revenue = non-voided invoices by invoice date + paid Stripe orders, all USD.
    companyOs.from("invoices").select("txn_date, amount_cents, balance_cents, status, entity").neq("status", "voided").limit(2000),
    companyOs.from("orders").select("created_at, amount_usd_cents, status").limit(2000),
    // All deals for the 30d funnel and 90d lead→won conversion.
    companyOs.from("deals").select("status, created_at, closed_at").is("archived_at", null).limit(2000),
    companyOs.from("lead").select("created_at").gte("created_at", iso90).limit(1000),
    companyOs
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .not("type", "in", NON_SALES_INQUIRY_TYPES)
      .gte("created_at", iso30),
    getSurveyScore("ai-capability-pulse"),
    // Marketing (DB-derived; analytics is streamed separately in MarketingSection).
    getAudienceBreakdown(),
    getDeliverability("30d"),
    getContentEngine(),
    getMeetingsBookedThisWeek(),
  ]);

  const stages = (stagesRes.data as Stage[] | null) ?? [];
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const deals = (dealsRes.data as DealRow[] | null) ?? [];
  const leads: LeadRow[] = ((leadsRes.data as unknown as LeadRawRow[] | null) ?? [])
    .filter((l) => l.people)
    .map((l) => ({
      id: l.people!.id,
      full_name: l.people!.full_name,
      email: l.people!.email,
      lead_status: l.status,
      lead_sla_due_at: l.sla_due_at,
      created_at: l.created_at,
    }));
  const inquiries = (inqRes.data as InquiryRow[] | null) ?? [];
  const slaOverdue = overdueRes.count ?? 0;
  const dealsClosed = ((wonRes.data as { amount_usd_cents: number | null }[] | null) ?? []).reduce(
    (s, d) => s + (d.amount_usd_cents ?? 0),
    0,
  );
  const err = stagesRes.error || dealsRes.error || leadsRes.error || inqRes.error;

  // ── Revenue office overview ──
  const invoices = ((invoicesRes.data as InvoiceRow[] | null) ?? []).filter((i) => i.txn_date);
  const paidOrders = ((ordersRes.data as OrderRow[] | null) ?? []).filter((o) => o.status === "paid");
  const invoiceCash = (from: string, to: string, entity?: "edge8" | "aio") =>
    invoices.reduce(
      (s, i) => (i.txn_date! >= from && i.txn_date! < to && (!entity || i.entity === entity) ? s + (i.amount_cents ?? 0) : s),
      0,
    );
  const stripeCash = (from: string, to: string) =>
    paidOrders.reduce((s, o) => {
      const d = o.created_at.slice(0, 10);
      return d >= from && d < to ? s + (o.amount_usd_cents ?? 0) : s;
    }, 0);
  const cashBetween = (from: string, to: string) => invoiceCash(from, to) + stripeCash(from, to);

  const revenue1yr = cashBetween(date365, tomorrow);
  const revenue1yrPrev = cashBetween(
    new Date(now.getTime() - 730 * MS_DAY).toISOString().slice(0, 10),
    date365,
  );
  const revenueYtd = cashBetween(yearStart, tomorrow);
  const entitySplit = (from: string, to: string) => (
    <>
      <div>Edge8 {compactUsd(invoiceCash(from, to, "edge8") + stripeCash(from, to))}</div>
      <div>AIO {compactUsd(invoiceCash(from, to, "aio"))}</div>
    </>
  );
  const revenueByMonth = monthsThisYear(now).map(({ label, from, to }) => ({ label, value: cashBetween(from, to) }));

  // AR = balance still owed on open/overdue invoices.
  const allInvoices = (invoicesRes.data as InvoiceRow[] | null) ?? [];
  const arOutstanding = allInvoices
    .filter((i) => i.status === "open" || i.status === "overdue")
    .reduce((s, i) => s + (i.balance_cents ?? 0), 0);

  const funnelDeals = (funnelDealsRes.data as FunnelDealRow[] | null) ?? [];
  const newLeadDates = ((newLeadsRes.data as { created_at: string }[] | null) ?? []).map((l) => l.created_at);
  const newLeads30 = newLeadDates.filter((d) => d >= iso30).length;
  const newLeadsPrev30 = newLeadDates.filter((d) => d >= iso60 && d < iso30).length;
  const funnel30 = [
    { label: "Inquiries", value: inq30Res.count ?? 0 },
    { label: "New leads", value: newLeads30 },
    { label: "Deals opened", value: funnelDeals.filter((d) => d.created_at >= iso30).length },
    { label: "Deals won", value: funnelDeals.filter((d) => d.status === "won" && d.closed_at && d.closed_at >= iso30).length },
  ];

  // Conversion (90d): won deals closed in-window over leads created in-window.
  const leads90 = newLeadDates.filter((d) => d >= iso90).length;
  const won90 = funnelDeals.filter((d) => d.status === "won" && d.closed_at && d.closed_at >= iso90).length;
  const conversion90 = leads90 ? Math.round((won90 / leads90) * 1000) / 10 : 0;

  // Marketing (DB-derived): audience, email opens + rate, active campaigns.
  const activeCampaigns = engine.activeCampaigns.map((c) => ({ id: c.id, title: c.name, status: String(c.status) }));

  const openPipeline = deals.reduce((s, d) => s + (d.amount_usd_cents ?? 0), 0);
  const needsAttention = deals
    .map((d) => ({ d, gaps: dealGaps(d) }))
    .filter((x) => x.gaps.length > 0)
    .sort((a, b) => (b.d.amount_usd_cents ?? 0) - (a.d.amount_usd_cents ?? 0));

  const firstStageId = stages[0]?.id ?? "";
  const dealStages: KanbanColumn[] = stages.map((s) => ({
    id: s.id,
    label: s.name,
    accent: s.is_won ? STAGE_WON : s.is_lost ? STAGE_LOST : STAGE_NEUTRAL,
  }));
  const lostStageIds = stages.filter((s) => s.is_lost).map((s) => s.id);
  const wonStageIds = stages.filter((s) => s.is_won).map((s) => s.id);

  // Full deal cards for the side car — the same shape the pipeline board uses, so
  // the cockpit opens the identical DealDetail shelf.
  const dealCards: DealCard[] = deals.map((d) => {
    const co = one(d.companies);
    const p = one(d.people);
    const rf = one(d.referrer);
    const pendingHandoff = d.handoff_status === "pending" && d.status === "open";
    return {
      id: d.id,
      columnId: pendingHandoff ? HANDOFF_COLUMN_ID : d.stage_id ?? firstStageId,
      stageId: d.stage_id ?? firstStageId,
      // Not fetched here — this cockpit view only opens DealDetail (no board/list
      // rendering), which never reads or writes position.
      position: 0,
      title: d.title,
      personId: d.person_id,
      personName: p?.full_name ?? p?.email ?? null,
      companyName: co?.name ?? null,
      referrerId: d.referrer_id,
      referrerName: rf?.full_name ?? rf?.email ?? null,
      referrerCompanyId: d.referrer_company_id,
      referrerCompanyName: one(d.referrer_company)?.name ?? null,
      amountCents: d.amount_cents,
      amountUsdCents: d.amount_usd_cents,
      currency: d.currency,
      probability: d.probability,
      status: d.status,
      expectedClose: d.expected_close_date,
      source: d.source,
      nextStep: d.next_step,
      nextStepDate: d.next_step_date,
      proposalUrl: d.proposal_url,
      contractUrl: d.contract_url,
      handoffStatus: d.handoff_status ?? "none",
      lostReason: d.lost_reason,
      archivedAt: null,
      updatedAt: d.updated_at,
    };
  });

  const cockpitDeals = needsAttention.map(({ d, gaps }) => {
    const co = one(d.companies);
    const p = one(d.people);
    return {
      id: d.id,
      title: d.title || co?.name || p?.full_name || p?.email || "Untitled deal",
      stage: d.stage_id ? stageName.get(d.stage_id) ?? "—" : "—",
      usd: d.amount_usd_cents,
      nextStep: d.next_step,
      gaps,
    };
  });

  return (
    <>
      <PageHead
        eyebrow="Four Offices · Revenue"
        title="Revenue cockpit"
        sub="Revenue, marketing signals, and the sales command center."
      />
      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err.message}
        </div>
      )}

      {/* ── Shared money strip: the numbers every revenue function cares about ── */}
      <div className="admin-kpi-grid u-mb-1">
        <MetricCard
          label="Revenue · 1yr"
          value={formatCents(revenue1yr)}
          sub={vsPrior(revenue1yr, revenue1yrPrev, (n) => compactUsd(n))}
        />
        <MetricCard label="Revenue · YTD" value={formatCents(revenueYtd)} sub={entitySplit(yearStart, tomorrow)} />
        <MetricCard label={`Won · YTD`} value={formatCents(dealsClosed)} sub={`closed deal value, ${year}`} href="/admin/revenue/deals" />
        <MetricCard label="AR outstanding" value={formatCents(arOutstanding)} sub="open + overdue invoices" href="/admin/revenue/invoices" />
      </div>

      {/* ── SALES ── */}
      <Band
        label="Sales"
        note={[
          needsAttention.length > 0 ? `${needsAttention.length} need attention` : "pipeline clean",
          slaOverdue > 0 ? `${slaOverdue} SLA overdue` : null,
        ].filter(Boolean).join(" · ")}
      />
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="Open pipeline" value={formatCents(openPipeline)} sub={`${deals.length} open deals`} href="/admin/revenue/deals" />
        <MetricCard label="New leads · 30d" value={newLeads30} sub={vsPrior(newLeads30, newLeadsPrev30)} href="/admin/revenue/leads" />
        <MetricCard label="Meetings booked" value={`${meetingsBooked} / ${WEEKLY_MEETINGS_GOAL}`} sub="this week vs goal" href="/admin/revenue/leads" />
        <MetricCard label="Conversion · 90d" value={`${conversion90}%`} sub="lead → won" />
      </div>
      <div className="admin-summary-grid u-mb-4">
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Revenue by month · {year}</div>
          <BarChart data={revenueByMonth} ariaLabel="Revenue by month" formatValue={compactUsd} />
        </div>
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Pipeline flow · last 30 days</div>
          <BarChart data={funnel30} ariaLabel="Pipeline flow over the last 30 days" emptyText="No pipeline activity in the last 30 days." />
        </div>
      </div>

      {/* ── Deals needing attention: the priority action list ── */}
      <div className="admin-card admin-section-card u-mb-5">
        <h2 className="admin-card-title">Deals needing attention</h2>
        <CockpitDeals
          deals={cockpitDeals}
          cards={dealCards}
          stages={dealStages}
          lostStageIds={lostStageIds}
          wonStageIds={wonStageIds}
        />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        {/* ── Leads to work ── */}
        <div className="admin-card admin-section-card" style={{ alignSelf: "start" }}>
          <h2 className="admin-card-title">Leads to work</h2>
          {leads.length === 0 ? (
            <div className="admin-empty">No current leads in the queue.</div>
          ) : (
            <div className="admin-list">
              {leads.slice(0, 8).map((l) => {
                const overdue = l.lead_sla_due_at && l.lead_sla_due_at < nowIso;
                return (
                  <div key={l.id} className="admin-list-row">
                    <div className="admin-list-main">
                      <div className="admin-list-title">
                        <Link href={`/admin/contacts/${l.id}`}>{l.full_name || l.email}</Link>
                      </div>
                      <div className="admin-list-sub">{l.email}</div>
                    </div>
                    <div className="admin-list-aside">
                      <Badge tone={overdue ? "err" : "info"} dot>
                        {l.lead_status ?? "new"}
                      </Badge>
                      <span className="admin-list-sub">
                        {l.lead_sla_due_at ? `SLA ${overdue ? "overdue" : formatDate(l.lead_sla_due_at)}` : `added ${timeAgo(l.created_at)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
              {leads.length > 8 && (
                <div className="u-pt-3">
                  <Link href="/admin/revenue/leads" className="admin-auth-link">View all {leads.length} in the queue →</Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Inquiries to triage ── */}
        {/* marginTop:0 cancels the `.admin-section-card + .admin-section-card` stacking
            margin, which the grid's adjacent siblings otherwise inherit and which would
            push this card 16px below the Leads card. */}
        <div className="admin-card admin-section-card" style={{ alignSelf: "start", marginTop: 0 }}>
          <h2 className="admin-card-title">Inquiries to triage</h2>
          {inquiries.length === 0 ? (
            <div className="admin-empty">No new contact-us inquiries. Inbox zero.</div>
          ) : (
            <div className="admin-list">
              {inquiries.slice(0, 8).map((q) => {
                const p = one(q.people);
                return (
                  <div key={q.id} className="admin-list-row">
                    <div className="admin-list-main">
                      <div className="admin-list-title">{p?.full_name || p?.email || "Unknown"}</div>
                      <div className="admin-list-sub">{q.subject || "Contact-us inquiry"}</div>
                    </div>
                    <div className="admin-list-aside">
                      <span className="admin-list-sub">{timeAgo(q.created_at)}</span>
                    </div>
                  </div>
                );
              })}
              <div className="u-pt-3">
                <Link href="/admin/revenue/inquiries" className="admin-auth-link">Open the inquiries board →</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MARKETING (analytics streams in its own boundary) ── */}
      <Band label="Marketing" note={`${audience.eligible} newsletter-eligible`} />
      <Suspense fallback={<MarketingSectionFallback />}>
        <MarketingSection
          audience={{ total: audience.total, eligible: audience.eligible }}
          openedEmails={delivery.opened}
          openRate={delivery.openRate}
          activeCampaigns={activeCampaigns}
        />
      </Suspense>

      {/* ── CUSTOMER SUCCESS (placeholder; retention + support tickets land here later) ── */}
      <Band label="Customer Success" note="coming later" muted />
      <div className="admin-kpi-grid u-dim">
        <MetricCard label="Active clients" value="—" sub="coming later" />
        <MetricCard label="Renewals due" value="—" sub="coming later" />
        <MetricCard
          label="Client feedback"
          value={clientScore.avg != null ? `${clientScore.avg} / ${clientScore.scale}` : "—"}
          sub={clientScore.responses > 0 ? `AI capability pulse · ${clientScore.responses} responses` : "coming later"}
        />
        <MetricCard label="At-risk accounts" value="—" sub="coming later" />
      </div>
    </>
  );
}
