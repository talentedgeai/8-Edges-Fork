import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'QuickBooks Invoice Sync | Edge8 Workflows'
const description =
  'A weekly sync pulls every invoice out of QuickBooks and maps it to the CRM, so revenue truth lives in one place instead of two tabs.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/invoice-sync/' },
  openGraph: { title, description, url: '/workflows/invoice-sync/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'A scheduled task fires every Monday morning. No one remembers to run it because no one has to.' },
  { name: 'Inputs', assignment: 'machine', desc: 'Invoices from QuickBooks and the customer-to-company mapping maintained on each CRM company record.' },
  { name: 'Decision', assignment: 'both', desc: 'Which QuickBooks customer belongs to which CRM company. Mapped by a human once, applied by the machine forever.' },
  { name: 'Routing', assignment: 'machine', desc: 'New invoices are created, changed invoices are updated, and unmapped customers are flagged for a human.' },
  { name: 'Output', assignment: 'machine', desc: 'A complete, current invoice ledger inside the admin, attached to the right companies.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The revenue dashboard reads directly from the synced ledger. No exports, no spreadsheets.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Synced totals reconcile against QuickBooks, so drift between the two systems is visible immediately.' },
]

export default function InvoiceSyncWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="QuickBooks Invoice Sync"
        tldr="A weekly sync pulls every invoice out of QuickBooks and maps it to the CRM, so revenue truth lives in one place. The books stay the source of truth; the CRM stays current without anyone copying numbers."
        meta={[
          { label: 'Cadence', value: 'Every Monday' },
          { label: 'Manual copying', value: '0' },
          { label: 'Source of truth', value: 'QuickBooks' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Four steps, once a week, unattended
          </h2>
          <p className="site-section-sub u-mt-3">
            This is the automation behind our <Link href="/workflows/monthly-invoicing">Monthly Invoicing</Link>{' '}
            cadence: humans run the billing rhythm, the sync keeps every system telling the same story.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Monday Sync Fires', cadence: 'Scheduled', actor: 'system' },
              { num: '02', title: 'Pull from QuickBooks', cadence: 'Automatic', actor: 'system' },
              { num: '03', title: 'Map to CRM Companies', cadence: 'Automatic', actor: 'system' },
              { num: '04', title: 'Revenue Dashboard', cadence: 'Always current', actor: 'system' },
            ]}
            repeatNote="Runs every week. Unmapped customers are the only thing a human ever touches."
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
                title: 'The sync fires on schedule',
                cadence: 'Monday, weekly',
                actor: 'system',
                body: (
                  <p>
                    A scheduled task runs every Monday. Weekly is deliberate: fresh enough that the dashboard is
                    trusted, calm enough that the books close before the numbers move.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Invoices come out of QuickBooks',
                actor: 'system',
                body: (
                  <p>
                    Every invoice is pulled from QuickBooks: new ones, updated ones, payments applied. QuickBooks
                    remains the accounting source of truth. The sync never writes back to it.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Each invoice maps to a CRM company',
                actor: 'system',
                body: (
                  <p>
                    Every QuickBooks customer is mapped to a CRM company record, so each invoice lands on the right
                    company&apos;s page. A customer without a mapping is flagged for a human instead of being guessed.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Revenue reads from one place',
                actor: 'system',
                body: (
                  <p>
                    Dashboards, client pages, and revenue reviews all read from the synced ledger. When someone asks
                    what a client is worth this year, the answer comes from one system, and it agrees with the books.
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
                <li>QuickBooks is the source of truth; the sync only reads</li>
                <li>Mapping decisions are made by humans, once, and remembered</li>
                <li>Unmapped customers get flagged, never guessed</li>
                <li>Nobody copies invoice numbers between systems, ever</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>One truth ends the weekly &ldquo;which number is right?&rdquo; conversation</li>
                <li>Client revenue history sits next to the relationship, where decisions happen</li>
                <li>Reconciliation catches drift the week it appears, not at year end</li>
                <li>The finance team&apos;s tool stays theirs; everyone else gets a live view</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
