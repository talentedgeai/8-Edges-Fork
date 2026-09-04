import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'both', desc: 'An admin creates the event once; from then on, each registration is triggered by an attendee.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The event record: name, date, capacity, price. One definition drives everything downstream.' },
  { name: 'Decision', assignment: 'machine', desc: 'Is the payment confirmed? Stripe answers, and the answer is the only thing that creates a seat.' },
  { name: 'Routing', assignment: 'machine', desc: 'The webhook writes confirmed registrations into the system, seconds after checkout.' },
  { name: 'Output', assignment: 'machine', desc: 'A confirmed seat tied to a real payment. Attendance and revenue are the same number.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Receipts go out through Stripe; the live registration list updates in the admin hub.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Registrations against capacity and revenue per event, visible as they happen.' },
]

const title = 'Event Registration | Edge8 Workflows'
const description =
  'Admin creates an event, the public signs up, Stripe takes payment, a webhook confirms the seat. No human in the middle of the money.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/event-registration/' },
  openGraph: { title, description, url: '/workflows/event-registration/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function EventRegistrationWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Revenue"
        title="Event Registration"
        tldr="An admin creates the event once. From there the public signs up, Stripe takes payment, and a webhook confirms the seat. No human touches the money path."
        meta={[
          { label: 'Admin effort', value: 'Create once' },
          { label: 'Payment', value: 'Stripe checkout' },
          { label: 'Confirmation', value: 'Webhook, instant' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            One setup step, then hands off
          </h2>
          <p className="site-section-sub u-mt-3">
            The only human step is the first one. Everything between a visitor clicking register and a confirmed seat
            in the admin hub is automated.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Create the Event', cadence: 'Admin hub', actor: 'human', actorLabel: 'Admin' },
              { num: '02', title: 'Public Signup Page', cadence: 'Instant', actor: 'system' },
              { num: '03', title: 'Stripe Checkout', cadence: 'Visitor pays', actor: 'contractor', actorLabel: 'Attendee' },
              { num: '04', title: 'Webhook Confirms', cadence: 'Seconds later', actor: 'system' },
              { num: '05', title: 'Registration in Hub', cadence: 'Live view', actor: 'system' },
            ]}
          />
        </div>
      </section>

      {/* Step detail */}
      <section className="section site-wf-section--tint">
        <div className="container">
          <span className="site-section-label site-wf-section--white">
            Step by step
          </span>
          <h2 className="site-section-title site-section-title--sm">
            How each step works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Admin creates the event',
                cadence: 'Once per event',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Name, date, capacity, price. The event is defined once in the admin hub, and that definition drives
                    everything downstream: the public page, the checkout, and the registration list.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The public page exists immediately',
                actor: 'system',
                body: (
                  <p>
                    A public signup page is generated from the event record. There is no second copy of the details to
                    keep in sync, so the page can never disagree with the event.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Attendee pays through Stripe',
                actor: 'contractor',
                actorLabel: 'Attendee',
                body: (
                  <p>
                    Registration and payment are one motion. The attendee checks out through Stripe, which handles
                    cards, receipts, and compliance. Nobody at Edge8 ever sees or handles card details.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'A webhook confirms the seat',
                actor: 'system',
                body: (
                  <p>
                    When Stripe confirms the payment, its webhook writes the registration into the system. The seat is
                    only counted when the money is real, so the attendee list and the revenue never diverge.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Admins watch it live',
                actor: 'system',
                body: (
                  <p>
                    Every confirmed registration appears in the admin hub as it happens: who registered, when, and
                    capacity remaining. Event day starts with a list that is already correct.
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
          <div className="site-wf-info-grid">
            <div className="site-wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>The event record is the single source for page, price, and capacity</li>
                <li>No payment, no seat: registrations exist only after Stripe confirms</li>
                <li>Card details never touch Edge8 systems</li>
                <li>The attendee list is read from the system, never kept in a spreadsheet</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>One definition drives everything, so nothing goes out of sync</li>
                <li>Webhook confirmation makes revenue and attendance the same number</li>
                <li>Zero manual steps between signup and seat means zero backlog</li>
                <li>Admins spend event week on the event, not on reconciliation</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
