import type { Metadata } from 'next'
import { WorkflowHero, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'The calendar. The 31st arrives every month whether anyone feels like invoicing or not.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The client list, agreed terms, and billing history, all living in QuickBooks.' },
  { name: 'Decision', assignment: 'human', desc: 'The exceptions: which client gets card payments enabled, and what gets escalated versus tolerated.' },
  { name: 'Routing', assignment: 'machine', desc: 'QuickBooks routes reminders to clients approaching their due date, automatically.' },
  { name: 'Output', assignment: 'both', desc: 'Invoices created by a human on the 31st, dated forward to the 1st by rule.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Invoices and reminders reach clients through QuickBooks the day they are created.' },
  { name: 'Measurement', assignment: 'both', desc: 'Paid versus due on the 20th. Anything past due becomes an escalation list, never a shrug.' },
]

const title = 'Monthly Invoicing | Edge8 Workflows'
const description =
  'One billing cycle, four dates, zero chasing. Invoices are created on the 31st, dated to the 1st, due on the 20th, and escalated the moment they slip.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/monthly-invoicing/' },
  openGraph: { title, description, url: '/workflows/monthly-invoicing/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function MonthlyInvoicingWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Monthly Invoicing"
        tldr="One billing cycle, four dates, zero chasing. Invoices are created on the 31st, dated forward to the 1st, due on the 20th, and escalated the moment they slip."
        meta={[
          { label: 'Created', value: '31st' },
          { label: 'Dated', value: '1st' },
          { label: 'Due', value: '20th' },
          { label: 'Card payments', value: 'Off by default' },
        ]}
      />

      {/* The billing cycle timeline */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The cycle</span>
          <h2 className="section-title section-title--sm">
            One month, four dates
          </h2>
          <p className="section-sub u-mt-3">
            The whole workflow hangs on a fixed calendar. Same dates every month, no judgment calls.
          </p>
          <div className="wf-timeline">
            <div className="wf-tl-track">
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>31st</strong>
                  <span>Create</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Invoices created</div>
                  <p className="wf-tl-desc">All client invoices built in QuickBooks on the last day of the month.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>1st</strong>
                  <span>Dated</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Dated forward &amp; sent</div>
                  <p className="wf-tl-desc">Invoice date is set to the 1st of the new month and sent the same day.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day">
                  <strong>20th</strong>
                  <span>Due</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Payment due</div>
                  <p className="wf-tl-desc">QuickBooks reminds clients automatically as the date approaches.</p>
                </div>
              </div>
              <div className="wf-tl-stop">
                <div className="wf-tl-day wf-tl-day-danger">
                  <strong>21st</strong>
                  <span>Escalate</span>
                </div>
                <div className="wf-tl-titlewrap">
                  <div className="wf-tl-title">Escalation</div>
                  <p className="wf-tl-desc">Anything unpaid past the 20th gets escalated. No waiting, no assuming.</p>
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
            The five steps
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Create client invoices',
                cadence: '31st of the month',
                actor: 'human',
                body: (
                  <p>
                    Invoices are created in QuickBooks on the 31st, dated forward to the 1st, with payment terms set to
                    the 20th. Credit card payment stays disabled by default, with a single exception client where it is
                    turned on.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Send invoices',
                cadence: 'Same day',
                actor: 'human',
                body: (
                  <p>
                    Invoices go out the same day they are created. One check before hitting send: the displayed invoice
                    date and due date are correct.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Automated reminders',
                cadence: 'Leading up to the 20th',
                actor: 'system',
                actorLabel: 'QuickBooks',
                body: (
                  <p>
                    QuickBooks automatically sends payment reminders to clients approaching their due date. No manual
                    action required unless a client has a specific question.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Payment due',
                cadence: '20th of the month',
                actor: 'system',
                actorLabel: 'QuickBooks',
                body: (
                  <p>
                    The 20th is the deadline. One known client pays a few days late every month, and that is accepted.
                    Everyone else is expected on time.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Escalate anything unpaid',
                cadence: '21st onward',
                actor: 'human',
                body: (
                  <p>
                    Any invoice unpaid beyond the 20th gets escalated immediately. The rule is explicit: do not wait,
                    and do not assume it will resolve itself.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Rules */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>Create on the 31st, date to the 1st, due on the 20th</li>
                <li>Credit card payments are off by default, one exception client</li>
                <li>Reminders are automated, never manual</li>
                <li>Past the 20th means escalate, not wait</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why the dates are fixed</h3>
              <ul>
                <li>Forward-dating keeps every invoice aligned to a clean calendar month</li>
                <li>A fixed due date makes late payments obvious at a glance</li>
                <li>Automation handles the chasing so humans only handle exceptions</li>
                <li>A hard escalation rule means receivables never quietly age</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
