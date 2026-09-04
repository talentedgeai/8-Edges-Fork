import type { Metadata } from 'next'
import { WorkflowHero, ActorChip, StepCards, SevenElements, DetailFooter, type Actor, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'An admin creates a written work request. No verbal assignments, so there is always a record.' },
  { name: 'Inputs', assignment: 'both', desc: 'The request scope from the admin; the estimate, actual hours, explanation, and proof link from the contractor.' },
  { name: 'Decision', assignment: 'human', desc: 'Two human gates: approve the estimate before work starts, approve the payment after it ships.' },
  { name: 'Routing', assignment: 'machine', desc: 'Every response triggers a Lark message and an email, looping the request until it is approved or closed.' },
  { name: 'Output', assignment: 'machine', desc: 'A monthly payment request per contractor, with estimates, actuals, and proof attached.' },
  { name: 'Delivery', assignment: 'machine', desc: 'One admin page listing every payment request, plus notifications back to the contractor on each outcome.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Estimates versus actuals per contractor over time, the number that makes the next estimate honest.' },
]

const title = 'Contractor Hours + Payment | Edge8 Workflows'
const description =
  'Every piece of contractor work moves through one loop: request, estimate, approval, delivery, and a monthly payment run. Notifications land in Lark and email.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/contractor-payments/' },
  openGraph: { title, description, url: '/workflows/contractor-payments/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

type LaneNode = {
  num: string
  lane: 'admin' | 'system' | 'contractor'
  actor: Actor
  actorLabel: string
  title: string
  desc: string
  outcomes?: { label: string; kind: 'approve' | 'reject' | 'info' }[]
}

const NODES: LaneNode[] = [
  {
    num: '1',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Admin',
    title: 'Create a work request',
    desc: 'The admin writes up the work: what it is, the context, and what done looks like.',
  },
  {
    num: '2',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Notify the contractor',
    desc: 'A Lark message and an email go out automatically, each with a link to respond.',
  },
  {
    num: '3',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'Contractor',
    title: 'Submit an estimate',
    desc: 'The link opens a form asking for their hour estimate and their plan to complete the work.',
  },
  {
    num: '4',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Admin',
    title: 'Review the estimate',
    desc: 'The admin makes a call. Every response triggers a notification back to the contractor.',
    outcomes: [
      { label: 'Approve', kind: 'approve' },
      { label: 'Reject', kind: 'reject' },
      { label: 'More info', kind: 'info' },
    ],
  },
  {
    num: '5',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'Contractor',
    title: 'Do the work, submit actuals',
    desc: 'Once approved, the contractor does the work and submits actual hours, an explanation, and a supporting link.',
  },
  {
    num: '6',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Monthly payment run',
    desc: 'On the 1st of the month, the system summarizes all completed work and creates a request to pay.',
  },
  {
    num: '7',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Admin',
    title: 'Review the payment request',
    desc: 'Admins see every payment request on one page and mark each one.',
    outcomes: [
      { label: 'Paid', kind: 'approve' },
      { label: 'Rejected', kind: 'reject' },
      { label: 'More info', kind: 'info' },
    ],
  },
]

export default function ContractorPaymentsWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Contractor Hours + Payment"
        tldr="Every piece of contractor work moves through one loop: request, estimate, approval, delivery, and a monthly payment run. Notifications land in Lark and email, and admins decide from one page."
        meta={[
          { label: 'Actors', value: 'Admin · System · Contractor' },
          { label: 'Payment run', value: '1st of the month' },
          { label: 'Approval gates', value: '2' },
        ]}
      />

      {/* Swimlane diagram */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Three lanes, seven steps
          </h2>
          <p className="site-section-sub u-mt-3">
            Work passes between the admin, the system, and the contractor. The system carries every handoff, so nobody
            has to remember to follow up.
          </p>

          <div className="site-wf-lanes-head">
            <div className="site-wf-lane-label site-wf-lane-label-admin">Admin</div>
            <div className="site-wf-lane-label site-wf-lane-label-system">System</div>
            <div className="site-wf-lane-label site-wf-lane-label-contractor">Contractor</div>
          </div>
          <div className="site-wf-lanes">
            {NODES.map((n) => (
              <div key={n.num} className={`site-wf-node wf-node-${n.lane}`}>
                <span className="site-wf-node-badge">{n.num}</span>
                <div className="u-mb-2">
                  <ActorChip actor={n.actor} label={n.actorLabel} />
                </div>
                <div className="site-wf-node-title">{n.title}</div>
                <p className="site-wf-node-desc">{n.desc}</p>
                {n.outcomes && (
                  <div className="site-wf-outcomes">
                    {n.outcomes.map((o) => (
                      <span key={o.label} className={`site-wf-outcome wf-outcome-${o.kind}`}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="site-wf-loop-note">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 014-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 01-4 4H3" />
            </svg>
            <span>
              Reject and more-info decisions loop back to the contractor with a notification, so a request keeps moving
              until it is approved or closed. Nothing gets paid without an approved estimate and submitted actuals.
            </span>
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
            From request to paid
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Create a work request',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Everything starts with a written request from the admin: the work to be done, the context, and what
                    done looks like. No verbal assignments, so there is always a record to estimate against.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Notify the contractor',
                actor: 'system',
                body: (
                  <p>
                    The moment a request is created, the contractor gets a Lark message and an email, each carrying a
                    link to their response form. Two channels means it never gets missed.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Submit an estimate',
                actor: 'contractor',
                body: (
                  <p>
                    The link asks the contractor for two things: their estimate in hours and their plan to complete the
                    work. Both go on the record before any work starts.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Review the estimate',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <>
                    <p>The admin reviews the estimate and picks one of three outcomes:</p>
                    <ul>
                      <li>
                        <strong>Approve</strong>: the contractor is cleared to start
                      </li>
                      <li>
                        <strong>Reject</strong>: the request is closed or reworked
                      </li>
                      <li>
                        <strong>More information</strong>: the contractor gets a specific follow-up question
                      </li>
                    </ul>
                    <p className="u-mt-3">
                      Every response triggers a notification back to the contractor, so the loop never stalls waiting
                      on a status update.
                    </p>
                  </>
                ),
              },
              {
                num: '05',
                title: 'Do the work, submit actuals',
                actor: 'contractor',
                body: (
                  <p>
                    Once approved, the contractor does the work. When it is done they submit their actual hours, an
                    explanation of what was delivered, and a supporting link as proof of the work.
                  </p>
                ),
              },
              {
                num: '06',
                title: 'Monthly payment run',
                cadence: '1st of the month',
                actor: 'system',
                body: (
                  <p>
                    On the 1st, the system summarizes every completed piece of work from the prior month per contractor
                    and creates a payment request. Estimates, actuals, and proof links are all attached.
                  </p>
                ),
              },
              {
                num: '07',
                title: 'Review the payment request',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Admins get one page listing every payment request. Each one is marked <strong>paid</strong>,{' '}
                    <strong>rejected</strong>, or <strong>more information required</strong>, and the contractor is
                    notified of the outcome.
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
                <li>No work starts without a written request and an approved estimate</li>
                <li>Every decision triggers a notification, in both Lark and email</li>
                <li>Actuals need an explanation and a supporting link, not just hours</li>
                <li>Payments batch monthly on the 1st, reviewed on one page</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Estimates before work means no surprise invoices</li>
                <li>The system owns the handoffs, so nothing waits on a human memory</li>
                <li>Proof links make every payment auditable months later</li>
                <li>One monthly run replaces ad hoc payment requests all month long</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
