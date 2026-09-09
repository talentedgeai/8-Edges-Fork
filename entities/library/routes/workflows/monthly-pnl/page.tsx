import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'Monthly P&L | Edge8 Workflows'
const description =
  'Invoices and expenses sync from QuickBooks all month, then close into a published P&L days after month end. Financial truth on a rhythm.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/monthly-pnl/' },
  openGraph: { title, description, url: '/workflows/monthly-pnl/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'Month end. The close does not wait for someone to feel ready.' },
  { name: 'Inputs', assignment: 'machine', desc: 'Invoices and expenses already synced from QuickBooks throughout the month, mapped to clients and vendors.' },
  { name: 'Decision', assignment: 'human', desc: 'Categorization exceptions and anything unusual. The judgment stays human; the routine does not.' },
  { name: 'Routing', assignment: 'machine', desc: 'Every line lands in its P&L category by rule, not by memory.' },
  { name: 'Output', assignment: 'both', desc: 'A monthly P&L statement: revenue, cost, and margin by line of business, reviewed by a human before it goes out.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Published as a shareable report, the same format every month.' },
  { name: 'Measurement', assignment: 'both', desc: 'Margin trends against forecast, month over month. The P&L measures the business; the trend measures the P&L.' },
]

export default function MonthlyPnlWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Monthly P&L"
        tldr="Invoices and expenses sync from QuickBooks all month, then close into a published P&L days after month end. The books are the source of truth, and the truth arrives on a rhythm."
        meta={[
          { label: 'Source of truth', value: 'QuickBooks' },
          { label: 'Close', value: 'Days, not weeks' },
          { label: 'Format', value: 'Same every month' },
        ]}
      />

      {/* The cycle */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The cycle</span>
          <h2 className="section-title section-title--sm">
            One month, four beats
          </h2>
          <p className="section-sub u-mt-3">
            The P&amp;L is not an event, it is the last step of a pipeline that runs all month. By the time the month
            closes, most of the work is already done.
          </p>
          <div className="wf-timeline">
            <div className="wf-tl-track">
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>1-31</strong>
                  <span>Sync</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Data flows all month</div>
                  <p className="wf-tl-desc">Invoices and expenses sync from QuickBooks continuously, mapped to clients and vendors.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>1st</strong>
                  <span>Close</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Month closes</div>
                  <p className="wf-tl-desc">The period locks and the P&amp;L assembles from already-synced data.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>~5th</strong>
                  <span>Review</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Human review</div>
                  <p className="wf-tl-desc">Exceptions get categorized, anomalies get explained, the statement gets signed off.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>~7th</strong>
                  <span>Publish</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">P&amp;L published</div>
                  <p className="wf-tl-desc">The statement goes out in the same format every month, with margin against forecast.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step detail */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            Step by step
          </span>
          <h2 className="section-title section-title--sm">
            How the close works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Revenue and cost sync all month',
                cadence: 'Continuous',
                actor: 'system',
                body: (
                  <p>
                    The <Link href="/workflows/invoice-sync">invoice sync</Link> and the expense sync pull from
                    QuickBooks throughout the month. There is no data-gathering scramble at close because the data was
                    never allowed to pile up.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The month closes and the P&L assembles',
                cadence: '1st of the month',
                actor: 'system',
                body: (
                  <p>
                    Every line lands in its category by rule: client revenue by line of business, vendor costs by type.
                    The draft statement exists within days of month end, not weeks.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'A human reviews the exceptions',
                actor: 'human',
                body: (
                  <p>
                    The review is short because it only covers what the rules could not place: new vendors, unusual
                    charges, anything that moved strangely against forecast. Judgment goes where judgment is needed.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'The P&L publishes',
                actor: 'human',
                actorLabel: 'Human + AI',
                body: (
                  <p>
                    The statement goes out as a shareable report in the same format every month: revenue, cost, and
                    margin by line of business, with the trend against forecast. Consistency is what makes it readable
                    at a glance.
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
                <li>QuickBooks is the only source of financial truth</li>
                <li>Data syncs all month; the close never starts from zero</li>
                <li>Rules categorize the routine, humans categorize the exceptions</li>
                <li>The same format ships every month, no redesigns</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>A fast close means decisions are made on last month, not last quarter</li>
                <li>Continuous sync turns month end from a project into a checkpoint</li>
                <li>Forecast comparison makes every P&amp;L a conversation, not a filing</li>
                <li>Consistent format means trends jump out instead of hiding</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
