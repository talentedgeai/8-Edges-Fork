import type { Metadata } from 'next'
import { WorkflowHero, ActorChip, StepCards, SevenElements, DetailFooter, type Actor, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'An employee submits a leave request in the team portal.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The current balance, leave history, and team calendar, attached to the request automatically.' },
  { name: 'Decision', assignment: 'human', desc: 'Approve or reject. The one judgment call in the flow stays with a human.' },
  { name: 'Routing', assignment: 'machine', desc: 'Requests route to the admin queue; outcomes route back to the employee’s portal.' },
  { name: 'Output', assignment: 'machine', desc: 'An updated balance and a calendar entry, computed, never hand-tracked.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The decision and new balance appear in the portal immediately.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Balances and usage across the team, correct at all times because they were never manual.' },
]

const title = 'Time Off | Edge8 Workflows'
const description =
  'Leave requests move from the team portal to an admin decision to an updated balance without a single chat message.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/time-off/' },
  openGraph: { title, description, url: '/workflows/time-off/', type: 'website' },
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
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'Employee',
    title: 'Request time off',
    desc: 'The employee picks dates and a leave type in the team portal. Their current balance is right there on the form.',
  },
  {
    num: '2',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Route to admin',
    desc: 'The request lands in the admin time-off queue with the employee’s balance and history attached.',
  },
  {
    num: '3',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Admin',
    title: 'Decide',
    desc: 'The admin sees the request in context: team calendar, remaining balance, overlapping leave.',
    outcomes: [
      { label: 'Approve', kind: 'approve' },
      { label: 'Reject', kind: 'reject' },
    ],
  },
  {
    num: '4',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Update the balance',
    desc: 'On approval, days are deducted automatically and the leave shows on the team calendar.',
  },
  {
    num: '5',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'Employee',
    title: 'See the outcome',
    desc: 'The employee sees the decision and their updated balance in the portal. No follow-up message needed.',
  },
]

export default function TimeOffWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Time Off"
        tldr="Leave requests move from the team portal to an admin decision to an updated balance without a single chat message. The system carries the request, the context, and the outcome."
        meta={[
          { label: 'Actors', value: 'Employee · System · Admin' },
          { label: 'Chat messages', value: '0' },
          { label: 'Balance updates', value: 'Automatic' },
        ]}
      />

      {/* Swimlane */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Request to decision in five steps
          </h2>
          <p className="site-section-sub u-mt-3">
            The whole loop is request, decide, record. Nobody chases anybody, and the balance math never gets done by
            hand.
          </p>

          <div className="site-wf-lanes-head">
            <div className="site-wf-lane-label site-wf-lane-label-admin">Admin</div>
            <div className="site-wf-lane-label site-wf-lane-label-system">System</div>
            <div className="site-wf-lane-label site-wf-lane-label-contractor">Employee</div>
          </div>
          <div className="site-wf-lanes">
            {NODES.map((n) => (
              <div key={n.num} className={`site-wf-node site-wf-node-${n.lane}`}>
                <span className="site-wf-node-badge">{n.num}</span>
                <div className="u-mb-2">
                  <ActorChip actor={n.actor} label={n.actorLabel} />
                </div>
                <div className="site-wf-node-title">{n.title}</div>
                <p className="site-wf-node-desc">{n.desc}</p>
                {n.outcomes && (
                  <div className="site-wf-outcomes">
                    {n.outcomes.map((o) => (
                      <span key={o.label} className={`site-wf-outcome site-wf-outcome-${o.kind}`}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
            How each step works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Request in the portal',
                actor: 'contractor',
                actorLabel: 'Employee',
                body: (
                  <p>
                    The employee opens the team portal, picks dates and a leave type, and submits. Their remaining
                    balance is shown on the form, so nobody requests days they do not have.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The system routes it',
                actor: 'system',
                body: (
                  <p>
                    The request appears in the admin queue with everything needed to decide: the employee&apos;s
                    balance, their leave history, and any team overlap on those dates.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Admin decides',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Approve or reject, one click either way. Because the context travels with the request, the decision
                    takes seconds instead of a back-and-forth thread.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Balance updates itself',
                actor: 'system',
                body: (
                  <p>
                    On approval the days are deducted automatically and the leave appears on the shared calendar.
                    Balances are never reconciled by hand at year end because they were never wrong.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Employee sees the outcome',
                actor: 'contractor',
                actorLabel: 'Employee',
                body: (
                  <p>
                    The decision and the updated balance show in the portal immediately. The whole loop closes without
                    a single &ldquo;did you see my request?&rdquo; message.
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
                <li>All leave goes through the portal, never through chat</li>
                <li>Balances are system-computed, never hand-tracked</li>
                <li>Every request is decided with the team calendar in view</li>
                <li>The decision and the record are the same thing</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>One queue means requests cannot get lost in a thread</li>
                <li>Context attached to the request makes decisions fast</li>
                <li>Automatic deduction kills the year-end balance argument</li>
                <li>Everyone sees the same calendar, so coverage gaps surface early</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
