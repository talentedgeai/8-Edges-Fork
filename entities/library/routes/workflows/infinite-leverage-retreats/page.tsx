import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  {
    name: 'Trigger',
    assignment: 'human',
    desc: 'A founder commits to a private retreat and confirms dates. That commitment opens a retreat record in our admin and starts the clock.',
  },
  {
    name: 'Inputs',
    assignment: 'both',
    desc: 'The dates, who is coming, the format (Build or Process), and the named projects the founder wants shipped by the last day. A person sets these; the system holds them against the retreat.',
  },
  {
    name: 'Decision',
    assignment: 'human',
    desc: 'Scope is a human call: which projects we commit to, whether we build a working program or install a way of working, and who from the team is on site each day.',
  },
  {
    name: 'Routing',
    assignment: 'both',
    desc: 'The format sets the agenda, and the booking path sets the money. Public retreats take registration and card payment; private retreats run on an invoice. The system knows which and tracks it.',
  },
  {
    name: 'Output',
    assignment: 'both',
    desc: 'Real AI programs, shipped and demoed against the named projects list, plus a complete profit-and-loss for the retreat with every cost captured as it happened.',
  },
  {
    name: 'Delivery',
    assignment: 'human',
    desc: 'Demo day walks the founder through everything shipped, equipment is handed over, and the certification path is set up as the continuation after they fly home.',
  },
  {
    name: 'Measurement',
    assignment: 'machine',
    desc: 'Profit per retreat is computed the day it ends, not weeks later, and projects completed are tracked against the plan we set on day one.',
  },
]

const title = 'Infinite Leverage Retreats | Edge8 Workflows'
const description =
  'How Edge8 runs an Infinite Leverage retreat: a founder ships real AI programs alongside the team in a few days, while the admin carries the money and the memory so profit is known the day it ends.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/infinite-leverage-retreats/' },
  openGraph: { title, description, url: '/workflows/infinite-leverage-retreats/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function InfiniteLeverageRetreatsWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Infinite Leverage Retreats"
        tldr="A founder flies in and ships real AI programs alongside our team in a handful of days. People run the relationship and the room; the admin runs the money and the memory. The retreat record holds the plan, captures every cost as it lands, and shows profit the day the founder leaves."
        meta={[
          { label: 'Cadence', value: 'Per retreat' },
          { label: 'Human-led', value: 'Sales + delivery' },
          { label: 'Automated', value: 'P&L + tracking' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The flow</span>
          <h2 className="section-title section-title--sm">
            Five stages, one running ledger
          </h2>
          <p className="section-sub u-mt-3">
            A private retreat is mostly human work: selling it, planning it, and delivering it in the room. What makes it
            repeatable is the layer underneath. From the moment a retreat is booked, it lives as a record that holds the
            budget, absorbs every cost as it happens, and closes itself into a profit number without a spreadsheet.
          </p>
          <FlowRail
            repeatNote="Every retreat runs the same five stages, and each one leaves the P&L a little more complete."
            steps={[
              { num: '01', title: 'Scope & Book', cadence: 'On deposit', actor: 'human' },
              { num: '02', title: 'Logistics Setup', cadence: 'Two weeks out', actor: 'human' },
              { num: '03', title: 'On-Site Delivery', cadence: 'Daily', actor: 'human' },
              { num: '04', title: 'Wrap & Demo', cadence: 'Last day', actor: 'human' },
              { num: '05', title: 'Close-Out', cadence: 'Within a week', actor: 'system' },
            ]}
          />
        </div>
      </section>

      {/* Step detail */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            Step by step
          </span>
          <h2 className="section-title section-title--sm">
            From a signed date to a closed P&L
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Scope & Book',
                cadence: 'On deposit',
                actor: 'human',
                body: (
                  <>
                    <p>
                      We agree the dates, who is coming, and the format: build a working program, or install a way of
                      working. Together with the founder we name the two or three projects that will be shipped by the
                      time they leave. That list becomes the definition of a successful retreat.
                    </p>
                    <p>
                      The moment the deposit is in, the retreat exists as a record in our admin, with an estimated budget
                      already attached. Everything after this point measures reality against that plan.
                    </p>
                  </>
                ),
              },
              {
                num: '02',
                title: 'Logistics Setup',
                cadence: 'Two weeks out',
                actor: 'human',
                body: (
                  <>
                    <p>
                      Operations works a standing checklist so nothing is improvised: visa support, flights, an apartment,
                      a car and driver, the workspace, and the daily agenda agreed with the founder. Every quote lands on
                      the retreat record, turning the estimate into a real budget before anyone arrives.
                    </p>
                    <p>The same checklist runs every time, so the tenth retreat is as smooth as it is familiar.</p>
                  </>
                ),
              },
              {
                num: '03',
                title: 'On-Site Delivery',
                cadence: 'Daily',
                actor: 'human',
                body: (
                  <>
                    <p>
                      The founder works hands-on with the team, not watching over a shoulder. Each morning opens with a
                      standup against the projects list, then build blocks toward the demo.
                    </p>
                    <ul>
                      <li>Costs are captured on the retreat record the day they happen, receipt and all</li>
                      <li>Project status is tracked against the plan, so progress is always visible</li>
                      <li>End-of-day updates keep the founder&apos;s stakeholders in the loop</li>
                    </ul>
                    <p>Nothing is reconstructed at the end, because nothing was left uncaptured along the way.</p>
                  </>
                ),
              },
              {
                num: '04',
                title: 'Wrap & Demo',
                cadence: 'Last day',
                actor: 'human',
                body: (
                  <p>
                    The last day is a demo day: we walk the founder through everything shipped against the projects we
                    named on day one. Any equipment they are taking home is configured and handed over, and we set them up
                    on the certification path so the momentum continues after they fly out.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Close-Out',
                cadence: 'Within a week',
                actor: 'system',
                actorLabel: 'System',
                body: (
                  <>
                    <p>
                      Public-retreat revenue has already flowed in from card payments without anyone reconciling it.
                      Operations enters the last remaining actuals, and the retreat closes into a finished profit-and-loss.
                    </p>
                    <ul>
                      <li>Revenue and costs total automatically, converted into one currency</li>
                      <li>Profit against the original estimate is there to read, per retreat</li>
                      <li>A short retro captures what to change before the next one</li>
                    </ul>
                  </>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Seven elements + info */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>Where the human stays in control</h3>
              <ul>
                <li>Selling the retreat and owning the founder relationship</li>
                <li>Choosing the projects and the format that fit the business</li>
                <li>Running the room and leading delivery day to day</li>
                <li>The judgment calls a spreadsheet can never make</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>The retreat is a record, not a workbook, so each new one runs on the same rails instead of a fresh spreadsheet</li>
                <li>Costs are captured live, so close-out is minutes instead of a half day</li>
                <li>Card revenue reconciles itself with no manual matching</li>
                <li>Profit is known the day the founder leaves, not weeks later</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
