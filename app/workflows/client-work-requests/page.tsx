import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'Client Work Requests | Edge8 Workflows'
const description =
  'Clients brief a contractor in the portal, approve the estimate, and accept the finished work. The invoice sends itself the moment they do.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/client-work-requests/' },
  openGraph: { title, description, url: '/workflows/client-work-requests/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'A client needs work done and opens a request in the portal. No email chains, no relay through an account manager.' },
  { name: 'Inputs', assignment: 'both', desc: "The client's brief plus the contractor's estimate: hours, timeline, and a definition of done." },
  { name: 'Decision', assignment: 'human', desc: 'Both gates belong to the client: approve the estimate before work starts, accept the work before billing.' },
  { name: 'Routing', assignment: 'machine', desc: 'Every transition notifies the right person automatically: the contractor gets the brief, the client gets the decision, the accountant gets every billing outcome.' },
  { name: 'Output', assignment: 'machine', desc: 'Accepted work and a QuickBooks invoice, created the moment the client says yes.' },
  { name: 'Delivery', assignment: 'machine', desc: 'QuickBooks emails the invoice and the CRM mirrors it instantly, so the account page is current before the weekly sync runs.' },
  { name: 'Measurement', assignment: 'machine', desc: 'An event log stamps who decided what and when, and every request carries a billing status, so nothing invoiced slips and nothing failed hides.' },
]

export default function ClientWorkRequestsWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Revenue"
        title="Client Work Requests"
        tldr="A client briefs work in the portal, a contractor scopes it, and the client holds both gates: approve the estimate before anything starts, accept the work before anything bills. The moment they accept, the invoice is created in QuickBooks and lands in their inbox."
        meta={[
          { label: 'Client decisions', value: '2' },
          { label: 'Ways to start', value: '3' },
          { label: 'Invoicing', value: 'Automatic' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            One loop, two client decisions
          </h2>
          <p className="site-section-sub u-mt-3">
            This is the client side of the loop. The contractor side runs on{' '}
            <Link href="/workflows/contractor-payments">Contractor Payments</Link>, and the invoice lands in the ledger
            kept true by <Link href="/workflows/invoice-sync">QuickBooks Invoice Sync</Link>.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Client Briefs the Work', cadence: 'On demand', actor: 'human', actorLabel: 'Client' },
              { num: '02', title: 'Contractor Estimates', cadence: 'Scoped', actor: 'contractor' },
              { num: '03', title: 'Client Approves', cadence: 'Decision one', actor: 'human', actorLabel: 'Client' },
              { num: '04', title: 'Work Submitted', cadence: 'When done', actor: 'contractor' },
              { num: '05', title: 'Client Accepts', cadence: 'Decision two', actor: 'human', actorLabel: 'Client' },
              { num: '06', title: 'Invoice Sends Itself', cadence: 'Same moment', actor: 'system' },
            ]}
            repeatNote="Every request runs the same loop. Our team can see every step, but is never a required gate."
          />
        </div>
      </section>

      {/* The scope loop */}
      <section className="section u-pt-0 u-pb-8">
        <div className="container">
          <span className="site-section-label">A branch</span>
          <h2 className="site-section-title site-section-title--sm">
            Adding scope, mid-flight
          </h2>
          <p className="site-section-sub u-mt-3">
            Work already underway and the client wants more? They add scope right on the same request. They never
            touch the hours — the added scope goes back to the contractor to re-estimate, and the client approves
            again before the extra work counts. Same request, same gate, still one invoice at the end.
          </p>
          <FlowRail
            steps={[
              { num: '3a', title: 'Client Adds Scope', cadence: 'While approved', actor: 'human', actorLabel: 'Client' },
              { num: '3b', title: 'Contractor Re-Estimates', cadence: 'Same link', actor: 'contractor' },
              { num: '3c', title: 'Client Approves Again', cadence: 'Same gate', actor: 'human', actorLabel: 'Client' },
            ]}
            repeatNote="Rejoins the main loop at ‘Work Submitted’. Scope can grow as many times as the client needs — every addition re-estimates and re-approves."
          />
        </div>
      </section>

      {/* Step detail */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="site-section-label wf-section--white">
            Step by step
          </span>
          <h2 className="site-section-title site-section-title--sm">
            How each step works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'The client opens a request in the portal',
                cadence: 'On demand',
                actor: 'human',
                actorLabel: 'Client',
                body: (
                  <p>
                    The portal offers three doors: a general request that routes to the team through the CRM, a project
                    brief aimed at a specific contractor, and pre-paid token packs of 40 hours for $2,000 for ongoing
                    work. This workflow follows the project brief.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The contractor scopes it',
                actor: 'contractor',
                body: (
                  <p>
                    The brief goes straight to the contractor through a secure link. They come back with an estimate:
                    hours, timeline, and what done looks like. No account manager translating in the middle.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'The client approves the estimate',
                actor: 'human',
                actorLabel: 'Client',
                body: (
                  <p>
                    Decision one. The client approves, requests changes, or declines, right in the portal. Nothing gets
                    built and nothing gets billed until they say go.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'The work gets done and submitted',
                actor: 'contractor',
                body: (
                  <p>
                    The contractor delivers and submits the finished work through the same request, so the client sees
                    exactly what they are being asked to sign off on.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'The client accepts',
                actor: 'human',
                actorLabel: 'Client',
                body: (
                  <p>
                    Decision two. The client reviews the work and accepts it, or sends it back with notes. Acceptance
                    is the only thing that triggers billing.
                  </p>
                ),
              },
              {
                num: '06',
                title: 'The invoice writes itself',
                actor: 'system',
                body: (
                  <p>
                    The moment the work is accepted, an invoice is created in QuickBooks at the agreed rate and emailed
                    to the client, then mirrored into the CRM so the account view is current immediately. If anything is
                    off, the system flags a human instead of guessing. A billing problem never blocks acceptance.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Anatomy + rules */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>The client decides twice; nothing starts and nothing bills without them</li>
                <li>Scope can grow mid-flight — every addition re-estimates and re-approves before it counts</li>
                <li>Our team sees every request but is never a required gate</li>
                <li>Billing failures flag a human; they never block acceptance</li>
                <li>Contractor pay runs on its own monthly cycle, untouched by this flow</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Requests skip the inbox and land where the work is tracked</li>
                <li>An estimate before approval means no surprise invoices</li>
                <li>Billing at the moment of acceptance means revenue never trails delivery</li>
                <li>The event log ends &ldquo;who agreed to what&rdquo; conversations before they start</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
