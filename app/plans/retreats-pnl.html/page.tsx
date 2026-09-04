import type { Metadata } from 'next'
import Link from 'next/link'

const title = 'Infinite Leverage Retreats P&L | Edge8 Program Brief'
const description =
  'A 5Ds program brief: move retreat profit-and-loss out of a fragile Excel workbook and onto the Events module, with a confidential, history-preserving home for employee wages that only Dave and Mai can see.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/plans/retreats-pnl.html' },
  openGraph: { title, description, url: '/plans/retreats-pnl.html', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function RetreatsPnlBrief() {
  return (
    <main>
      {/* Hero */}
      <section className="wf-hero">
        <div className="container">
          <div className="wf-hero-inner">
            <div className="wf-breadcrumb">
              <Link href="/workflows/infinite-leverage-retreats">Infinite Leverage Retreats</Link>
              <span>/</span>
              <span>Program Brief</span>
            </div>
            <h1 className="section-title">Infinite Leverage Retreats P&amp;L</h1>
            <p className="wf-hero-sub">
              Move retreat profit-and-loss out of a fragile Excel workbook and onto the Events module in the Edge8
              admin, with a confidential, history-preserving home for employee wages that only Dave and Mai can see.
            </p>
            <div className="brief-hero-pills">
              <span className="brief-pill is-primary">Outcome: Cheaper Operations</span>
              <span className="brief-pill is-secondary">ROI: Time saved</span>
              <span className="brief-pill">Type: Admin module extension</span>
              <span className="brief-pill">Difficulty: Medium</span>
            </div>
            <div className="wf-hero-meta">
              <span className="wf-meta-chip">Owner <strong>Dave Hajdu</strong></span>
              <span className="wf-meta-chip">Users <strong>My &amp; Mai</strong></span>
              <span className="wf-meta-chip">Format <strong>A01 5Ds Brief</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* D1 · Define */}
      <section className="section">
        <div className="container">
          <span className="section-label brief-d">
            <strong>D1</strong> · Definition of the Problem
          </span>
          <h2 className="section-title section-title--sm">
            A fast-growing program run by hand
          </h2>
          <p className="section-sub u-mt-3">
            Operations runs the P&amp;L for every Private and Public Infinite Leverage Retreat in a shared Excel
            workbook. As the program grows, that manual work compounds; the fix is to make the process the product.
          </p>
          <div className="wf-elements brief-def">
            <div className="wf-element">
              <div className="wf-element-head"><span className="wf-element-name">Who</span></div>
              <p className="wf-element-desc">
                Operations (My and Mai), who run the retreat P&amp;L, and Dave, who needs live margin per retreat
                instead of after-the-fact accounting.
              </p>
            </div>
            <div className="wf-element">
              <div className="wf-element-head"><span className="wf-element-name">Cost</span></div>
              <p className="wf-element-desc">
                Each retreat is closed by hand: one tab per retreat, hand-typed formulas, VND and USD mixed line by
                line, payments reconciled from notes. All told, up to 20 hours of accounting per retreat, repeating and
                growing with every retreat the program adds.
              </p>
            </div>
            <div className="wf-element">
              <div className="wf-element-head"><span className="wf-element-name">Why now</span></div>
              <p className="wf-element-desc">
                Four retreats are already booked across August and September, and the load climbs with each one.
                Putting a repeatable system around it now keeps that time on delivering retreats, not accounting for
                them.
              </p>
            </div>
            <div className="wf-element">
              <div className="wf-element-head"><span className="wf-element-name">Success</span></div>
              <p className="wf-element-desc">
                Every retreat from Sydney (Aug 27) onward is managed entirely in the admin app with profit visible the
                day it ends, and every wage lives in a controlled record, dual currency, full history, seen by two
                people.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* D2 · Datasources */}
      <section className="section section--tint">
        <div className="container">
          <span className="section-label brief-d wf-section--white">
            <strong>D2</strong> · Datasources Needed
          </span>
          <h2 className="section-title section-title--sm">
            Everything already exists
          </h2>
          <p className="section-sub u-mt-3">
            The program pulls from the company database and two source workbooks. Nothing new is collected.
          </p>
          <div className="wf-table-wrap u-mt-6">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Retreats P&amp;L workbook</td>
                  <td>Historical retreat P&amp;Ls for one-time backfill; the process being replaced.</td>
                </tr>
                <tr>
                  <td>MasterList (confidential)</td>
                  <td>Current gross salaries in VND for the one-time wage backfill. Values go to the database only, never the repo.</td>
                </tr>
                <tr>
                  <td>Events</td>
                  <td>Retreats already exist as event records: Saigon, Sydney Aug 27, Melbourne Aug 24, Saigon Aug 8 &amp; 9, EO Melbourne Sep 30.</td>
                </tr>
                <tr>
                  <td>Orders + registrations</td>
                  <td>Stripe revenue for public retreats, captured automatically at checkout.</td>
                </tr>
                <tr>
                  <td>QuickBooks invoices</td>
                  <td>Private retreat revenue. Every private retreat is billed under an <b>Infinite Leverage</b> product so all retreat invoices roll up in one place and match to the retreat&apos;s P&amp;L.</td>
                </tr>
                <tr>
                  <td>Compensation</td>
                  <td>Existing rate table, extended to hold salary history.</td>
                </tr>
                <tr>
                  <td>FX rates</td>
                  <td>Live USD normalization for P&amp;L lines. Wages use a fixed 25,500 VND/USD instead.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* D3 · Diagram & Workflow */}
      <section className="section">
        <div className="container">
          <span className="section-label brief-d">
            <strong>D3</strong> · Diagram &amp; Documented Workflow
          </span>
          <h2 className="section-title section-title--sm">
            Two workstreams, one system
          </h2>

          <h3
            className="site-h-display u-m-0 u-mt-6"
          >
            Workstream A · Retreat P&amp;L on the Events module
          </h3>
          <div className="wf-rail">
            <div className="wf-rail-step">
              <span className="wf-rail-num wf-rail-num-human">01</span>
              <span className="wf-rail-cadence">Per line</span>
              <div className="wf-rail-title">Ops enters lines</div>
              <span className="wf-actor wf-actor-human">Human</span>
            </div>
            <div className="wf-rail-step">
              <span className="wf-rail-num wf-rail-num-system">02</span>
              <span className="wf-rail-cadence">Automatic</span>
              <div className="wf-rail-title">Stripe + QuickBooks revenue</div>
              <span className="wf-actor wf-actor-system">System</span>
            </div>
            <div className="wf-rail-step">
              <span className="wf-rail-num wf-rail-num-system">03</span>
              <span className="wf-rail-cadence">On save</span>
              <div className="wf-rail-title">Normalize to USD</div>
              <span className="wf-actor wf-actor-system">System</span>
            </div>
            <div className="wf-rail-step">
              <span className="wf-rail-num wf-rail-num-system">04</span>
              <span className="wf-rail-cadence">Live</span>
              <div className="wf-rail-title">Estimated vs Actual vs Profit</div>
              <span className="wf-actor wf-actor-system">System</span>
            </div>
          </div>

          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>What the P&amp;L tab holds</h3>
              <ul>
                <li>Revenue by stream and expenses grouped by classification</li>
                <li>Estimated vs actual vs difference, with payment status</li>
                <li>Native VND or USD per line, totals normalized to USD</li>
                <li>Staff lines at a flat $150/day, so real wages never leak here</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>The retreat is a record, not a workbook, so each new one runs on the same rails</li>
                <li>Costs are captured live, so close-out is minutes instead of hours</li>
                <li>Card and invoice revenue reconcile themselves</li>
                <li>Profit is known the day the retreat ends</li>
              </ul>
            </div>
          </div>

          <h3
            className="site-h-display u-m-0 u-mt-7"
          >
            Workstream B · Confidential wage records
          </h3>
          <div className="wf-open u-mt-5">
            <h3>Dave &amp; Mai only</h3>
            <p>
              Wages, and all PII, are gated to two people. Being an admin is not enough; the check runs server-side and
              the data is never sent to anyone else&apos;s browser. Wage data is also invisible to the admin AI
              assistant.
            </p>
            <ul>
              <li>Salary stored in both VND and USD, converted at a fixed 25,500, both fields editable</li>
              <li>Every change adds a new dated row with reason and approver; nothing is overwritten</li>
              <li>ID documents, bank details, and personal contacts sit behind the same gate</li>
            </ul>
          </div>
        </div>
      </section>

      {/* D4 · ROI */}
      <section className="section section--tint">
        <div className="container">
          <span className="section-label brief-d wf-section--white">
            <strong>D4</strong> · ROI Determined
          </span>
          <h2 className="section-title section-title--sm">
            The whole return is time saved
          </h2>
          <div className="brief-fast u-mt-5">
            <div className="lbl">FAST goal</div>
            <p>
              By 4 weeks after launch, every retreat from Sydney (Aug 27) onward has its P&amp;L maintained entirely in
              the admin app, and the up-to-20 hours of manual accounting per retreat drops to a couple of hours of
              light data entry.
            </p>
          </div>
          <div className="brief-stats">
            <div className="brief-stat">
              <div className="big">Up to 20 hrs → ~2 hrs</div>
              <div className="cap">Accounting time per retreat. Revenue posts itself, costs are captured live, totals compute.</div>
            </div>
            <div className="brief-stat">
              <div className="big">~$1,000/mo avoided</div>
              <div className="cap">No dedicated accounting hire as the program scales (~$12k/year).</div>
            </div>
          </div>
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>Measures</h3>
              <ul>
                <li>100% of retreats have a live P&amp;L; summary numbers are computed, never retyped</li>
                <li>Card payments and QuickBooks invoices flow in without manual reconciliation</li>
                <li>100% of active staff have a wage record with history</li>
                <li>Wage and PII access verified restricted to exactly 2 people</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* D5 · Deploy */}
      <section className="section">
        <div className="container">
          <span className="section-label brief-d">
            <strong>D5</strong> · Deployment Plan
          </span>
          <h2 className="section-title section-title--sm">
            Six phases, first action in 7 days
          </h2>
          <div className="wf-steps">
            <div className="wf-step">
              <div className="wf-step-num">01</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">Database migration</span></div>
                <div className="wf-step-body">
                  P&amp;L lines table, dual-currency wage columns, and the Dave-and-Mai-only access flag. Smoke-tested
                  before anything is built on top.
                </div>
              </div>
            </div>
            <div className="wf-step">
              <div className="wf-step-num">02</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">Data layer + access gate</span></div>
                <div className="wf-step-body">Server-side accessors, verified that a non-cleared admin gets no wage data at all.</div>
              </div>
            </div>
            <div className="wf-step">
              <div className="wf-step-num">03</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">P&amp;L tab</span></div>
                <div className="wf-step-body">On the retreat detail page, verified by type-check and production build.</div>
              </div>
            </div>
            <div className="wf-step">
              <div className="wf-step-num">04</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">Compensation section</span></div>
                <div className="wf-step-body">On the employee record, rendered only for Dave and Mai.</div>
              </div>
            </div>
            <div className="wf-step">
              <div className="wf-step-num">05</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">Backfills</span></div>
                <div className="wf-step-body">
                  Historical retreats from the workbook (totals must match per retreat); salaries from MasterList at
                  25,500.
                </div>
              </div>
            </div>
            <div className="wf-step">
              <div className="wf-step-num">06</div>
              <div>
                <div className="wf-step-head"><span className="wf-step-title">Handover</span></div>
                <div className="wf-step-body">My and Mai run the Sydney retreat P&amp;L in the app; the workbook goes read-only.</div>
              </div>
            </div>
          </div>

          <h3 className="site-h-display site-h-display--lg u-m-0 u-mt-8">
            Definition of Done
          </h3>
          <ul className="brief-dod">
            <li>My and Mai maintain revenue and expense lines on any retreat, with estimated vs actual, VND or USD, and USD totals and profit computed automatically.</li>
            <li>Stripe-paid registrations appear automatically as read-only revenue rows on public retreats.</li>
            <li>Staff lines compute at $150/day from person + days, overridable.</li>
            <li>All historical retreats exist in the system and each backfilled retreat&apos;s totals match the workbook.</li>
            <li>Every active employee has a current salary row in both VND and USD (25,500 rate), and every change creates a new dated row so history is never lost.</li>
            <li>Wage and PII surfaces return data only for Dave and Mai, verified by loading them as another admin.</li>
            <li>No salary value appears in the repo, logs, or commit history.</li>
            <li>One real retreat (Sydney, Aug 27) is closed out entirely in the app and the workbook is retired.</li>
          </ul>
        </div>
      </section>

      {/* Out of scope + CTA */}
      <section className="section section--tint">
        <div className="container">
          <span className="section-label wf-section--white">Scope</span>
          <h2 className="section-title site-h-28">
            Out of scope for v1
          </h2>
          <p className="brief-scope">
            <b>Parked:</b> fixed program expenses and all-up program P&amp;L · summary dashboard (revenue by stream,
            participants vs the 100 goal) · To Buy procurement list · QuickBooks reconciliation of retreat expenses ·
            automatic Stripe fee capture · wage-based retreat costing.
          </p>
          <div className="wf-detail-foot">
            <Link href="/workflows/infinite-leverage-retreats" className="wf-back">
              ← See the workflow
            </Link>
            <Link href="/contact" className="btn btn-secondary">
              Talk to Edge8 →
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
