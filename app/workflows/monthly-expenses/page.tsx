import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'Monthly Expense Entry | Edge8 Workflows'
const description =
  'Bank transactions become a categorized finance sheet, the sheet becomes QuickBooks entries, and the P&L confirms the month. Every expense entered, every pass-through billed.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/monthly-expenses/' },
  openGraph: { title, description, url: '/workflows/monthly-expenses/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'Month end, when the bank transactions are available. The close runs on a rhythm, not a mood.' },
  { name: 'Inputs', assignment: 'human', desc: 'Vietnam bank transactions, the US expense sheet, and the finance tracking sheet that structures both.' },
  { name: 'Decision', assignment: 'human', desc: 'AIO allocation and pass-through vs direct categorization. The judgment calls are named and scheduled, not improvised.' },
  { name: 'Routing', assignment: 'both', desc: 'The tracking sheet routes every line into its category: payroll, social insurance, PIT, and the Edge8 breakdowns.' },
  { name: 'Output', assignment: 'human', desc: 'QuickBooks expense entries: one per category on the Vietnam side, one per vendor on the US side.' },
  { name: 'Delivery', assignment: 'human', desc: 'Entered directly into QuickBooks as direct payments. No accounts payable, nothing accrued.' },
  { name: 'Measurement', assignment: 'both', desc: 'The P&L, run before and after. Month-over-month consistency is the error detector; anything that moved gets explained.' },
]

export default function MonthlyExpensesWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Monthly Expense Entry"
        tldr="Bank transactions become a categorized finance sheet, the sheet becomes QuickBooks entries, and the P&L confirms the month looks like every other month. The routine is mechanical; the judgment calls are named and scheduled."
        meta={[
          { label: 'Source of truth', value: 'QuickBooks' },
          { label: 'Cadence', value: 'Monthly' },
          { label: 'Accounts payable', value: 'None, pay immediately' },
        ]}
      />

      {/* The cycle */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The cycle</span>
          <h2 className="site-section-title site-section-title--sm">
            One close, four beats
          </h2>
          <p className="site-section-sub u-mt-3">
            The close starts and ends with the P&amp;L. In between, expenses are entered in two passes: Vietnam first,
            then US.
          </p>
          <div className="site-wf-timeline">
            <div className="site-wf-tl-track">
              <div className="site-wf-tl-stop">
                <div className="site-wf-tl-day">
                  <strong>1</strong>
                  <span>Orient</span>
                </div>
                <div className="site-wf-tl-titlewrap">
                  <div className="site-wf-tl-title">P&amp;L first</div>
                  <p className="site-wf-tl-desc">Run the P&amp;L and compare to prior months before entering anything.</p>
                </div>
              </div>
              <div className="site-wf-tl-stop">
                <div className="site-wf-tl-day">
                  <strong>2</strong>
                  <span>Vietnam</span>
                </div>
                <div className="site-wf-tl-titlewrap">
                  <div className="site-wf-tl-title">Bank to sheet to QuickBooks</div>
                  <p className="site-wf-tl-desc">Break down the bank transactions, fill the finance tracking sheet, enter in QuickBooks.</p>
                </div>
              </div>
              <div className="site-wf-tl-stop">
                <div className="site-wf-tl-day">
                  <strong>3</strong>
                  <span>US</span>
                </div>
                <div className="site-wf-tl-titlewrap">
                  <div className="site-wf-tl-title">One entry per vendor</div>
                  <p className="site-wf-tl-desc">Itemize the US expense sheet into QuickBooks, one expense entry per vendor.</p>
                </div>
              </div>
              <div className="site-wf-tl-stop">
                <div className="site-wf-tl-day">
                  <strong>4</strong>
                  <span>Verify</span>
                </div>
                <div className="site-wf-tl-titlewrap">
                  <div className="site-wf-tl-title">Reconcile and spot check</div>
                  <p className="site-wf-tl-desc">Check pass-throughs against invoices, run the P&amp;L again, flag anything weird.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step detail */}
      <section className="section site-wf-section--tint">
        <div className="container">
          <span className="site-section-label site-wf-section--white">
            Step by step
          </span>
          <h2 className="site-section-title site-section-title--sm">
            Creating the expense entries
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Run the P&L first',
                cadence: 'Start of close',
                actor: 'human',
                body: (
                  <p>
                    Run the P&amp;L and compare the month to prior months. The business barely changes, so any line that
                    moved is either real news or an entry error. Note every inconsistency to resolve during the close.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Break down the Vietnam bank transactions',
                actor: 'human',
                body: (
                  <>
                    <p>From the Vietnam bank transactions, separate out:</p>
                    <ul>
                      <li>Payroll</li>
                      <li>Social insurance payments</li>
                      <li>PIT (personal income tax) payments</li>
                      <li>Everything remaining is other expenses</li>
                    </ul>
                    <p className="u-mt-3">Then label which expenses belong to AIO.</p>
                  </>
                ),
              },
              {
                num: '03',
                title: 'Fill in the finance tracking sheet',
                actor: 'human',
                body: (
                  <>
                    <p>
                      Open the{' '}
                      <a href="https://edge8company.sg.larksuite.com/wiki/D7KuwVxFEiXHxfkIhj8ldAeegcb?sheet=QAXynP">
                        finance tracking sheet
                      </a>{' '}
                      and fill the columns: payroll, social insurance, PIT, other expenses. Then break up the Edge8
                      expenses:
                    </p>
                    <ul>
                      <li>Staffing</li>
                      <li>Operations</li>
                      <li>Edge8 expenses</li>
                      <li>Whatever is left over = AI program contractors</li>
                    </ul>
                  </>
                ),
              },
              {
                num: '04',
                title: 'The AIO conversation',
                cadence: 'Every month',
                actor: 'human',
                body: (
                  <p>
                    Agree the AIO expense allocation with Dave before entering it. This includes speaking fees. Do not
                    enter AIO numbers without this conversation.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Create the Vietnam entries in QuickBooks',
                actor: 'human',
                body: (
                  <ul>
                    <li>One expense entry for the Vietnam total from the finance tracking sheet</li>
                    <li>One entry per Edge8 category: staffing, operations, Edge8 expenses, AI program contractors</li>
                    <li>All entries are direct payments from the checking account</li>
                  </ul>
                ),
              },
              {
                num: '06',
                title: 'Create the US entries in QuickBooks',
                cadence: 'Sheet from Dave',
                actor: 'human',
                body: (
                  <p>
                    Take the US expense sheet and create one expense entry per vendor. Be careful to categorize Project
                    Expenses (pass-through) vs direct expenses.
                  </p>
                ),
              },
              {
                num: '07',
                title: 'Check pass-throughs against invoices',
                actor: 'human',
                body: (
                  <p>
                    Project Expenses must match invoices on pass-through income. Report every mismatch; do not absorb
                    it. Invoices come from the <Link href="/workflows/monthly-invoicing">monthly invoicing workflow</Link>,
                    which runs separately.
                  </p>
                ),
              },
              {
                num: '08',
                title: 'Run the P&L again and spot check',
                cadence: 'End of close',
                actor: 'human',
                body: (
                  <p>
                    Run the P&amp;L and spot-check month-over-month consistency. Flag anything weird for a conversation;
                    never fix silently.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Anatomy */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
