import type { Metadata } from 'next'
import { WorkflowHero, ActorChip, StepCards, SevenElements, DetailFooter, type Actor, type WorkflowElement } from '../ui'

const title = 'Edge8 Onboarding Cycle | Edge8 Workflows'
const description =
  'Every new hire moves through six onboarding stages on a kanban board that runs itself: the system chases the plan, sends the surveys, triggers the reviews, and flips the status. Humans hold the sessions and make the one call that matters.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/edge8-onboarding-cycle/' },
  openGraph: { title, description, url: '/workflows/edge8-onboarding-cycle/', type: 'website' },
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
    actorLabel: 'Manager',
    title: 'Upload the onboarding plan',
    desc: 'Due one week before Day 1. If it is missing, the system emails the manager every day until it arrives, with the Talent Director copied.',
  },
  {
    num: '2',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Day 1: orientation is pre-loaded',
    desc: 'Three one-hour sessions are already on the card as a checklist: HR handbook, Intro to Edge8, and a team overview with the manager.',
  },
  {
    num: '3',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'New hire',
    title: 'Day 8: the feedback survey lands',
    desc: 'The system sends the new hire a three-question pulse: do I have what I need, do I feel good about the culture, do I understand the policies.',
  },
  {
    num: '4',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Manager',
    title: 'Day 45: the review and the call',
    desc: 'The system emails the manager the performance review. The manager makes the one decision the machine never will.',
    outcomes: [
      { label: 'Offer full time', kind: 'approve' },
      { label: 'Extend 30 days', kind: 'info' },
      { label: 'Terminate', kind: 'reject' },
    ],
  },
  {
    num: '5',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Day 60: promotion runs itself',
    desc: 'If the manager passed them, the status flips to full-time employee automatically and a congratulations email goes out, copying the manager and the recruiter.',
  },
  {
    num: '6',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Day 180: the stay interview',
    desc: 'The Talent Director gets the prompt to sit down for a stay interview. Onboarding ends with a conversation about staying, not paperwork.',
  },
]

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'The calendar. Every stage keys off the start date, so nothing depends on someone remembering.' },
  { name: 'Inputs', assignment: 'human', desc: 'The onboarding plan from the manager, survey answers from the new hire, and the 45-day review decision.' },
  { name: 'Decision', assignment: 'human', desc: 'Offer full time, extend probation 30 days, or terminate. A manager makes this call; the system only enforces its consequences.' },
  { name: 'Routing', assignment: 'machine', desc: 'The right email to the right person on the right day: nags to managers, surveys to hires, reviews to managers, prompts to the Talent Director.' },
  { name: 'Output', assignment: 'machine', desc: 'A live kanban card per hire with every milestone stamped, and a status flip to full-time the moment it is earned.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The My Team board in the team portal for managers, and the inbox for everyone the clock touches.' },
  { name: 'Measurement', assignment: 'machine', desc: 'On-time milestones per hire: plan uploaded before Day 1, survey answered, review decided, promotion on schedule.' },
]

export default function Edge8OnboardingCycleWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="Edge8 Onboarding Cycle"
        tldr="Every new hire gets a kanban card that moves through six stages, from pre-boarding to a 180-day stay interview. The system chases the plan, sends the surveys, triggers the reviews, and flips the status. Humans hold the sessions and make one decision."
        meta={[
          { label: 'Stages', value: '6' },
          { label: 'Runs on', value: 'A daily clock' },
          { label: 'Human decision', value: 'One, at Day 45' },
        ]}
      />

      {/* Swimlane */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">The flow</span>
          <h2 className="section-title section-title--sm">
            From pre-boarding to staying
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Onboarding fails on follow-through: the plan nobody wrote, the check-in nobody scheduled, the probation
            decision that slipped. Here the calendar does the chasing, so every hire gets the same six stages whether
            anyone remembers or not.
          </p>

          <div className="wf-lanes-head">
            <div className="wf-lane-label wf-lane-label-admin">Manager</div>
            <div className="wf-lane-label wf-lane-label-system">System + AI</div>
            <div className="wf-lane-label wf-lane-label-contractor">New hire</div>
          </div>
          <div className="wf-lanes">
            {NODES.map((n) => (
              <div key={n.num} className={`wf-node wf-node-${n.lane}`}>
                <span className="wf-node-badge">{n.num}</span>
                <div style={{ marginBottom: 8 }}>
                  <ActorChip actor={n.actor} label={n.actorLabel} />
                </div>
                <div className="wf-node-title">{n.title}</div>
                <p className="wf-node-desc">{n.desc}</p>
                {n.outcomes && (
                  <div className="wf-outcomes">
                    {n.outcomes.map((o) => (
                      <span key={o.label} className={`wf-outcome wf-outcome-${o.kind}`}>
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
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            Step by step
          </span>
          <h2 className="section-title section-title--sm">
            How each stage works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'The plan comes first, and the system enforces it',
                actor: 'human',
                actorLabel: 'Manager',
                cadence: 'A week before Day 1',
                body: (
                  <p>
                    Every person gets an onboarding plan, uploaded by their manager one week before they start. If it
                    is not there, the manager gets an email every single day until Day 1, with the Talent Director
                    copied. Polite, relentless, impossible to ignore.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Day 1 is a checklist, not a scramble',
                actor: 'system',
                cadence: 'Day 1',
                body: (
                  <p>
                    Three orientation sessions are seeded onto the card before the hire walks in: an hour on the HR
                    handbook, an hour of Intro to Edge8, and an hour with their manager on how the team works. The
                    manager ticks them off; the card shows what actually happened.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Day 8 asks the new hire how it is going',
                actor: 'contractor',
                actorLabel: 'New hire',
                cadence: 'Day 8',
                body: (
                  <p>
                    A three-question survey arrives automatically: I have the information I need to do my job well, I
                    feel good about the company culture, I understand the company policies. Five-point scale, two
                    minutes, and the score lands on the card where the manager can see it.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Day 45 forces the decision early',
                actor: 'human',
                actorLabel: 'Manager',
                cadence: 'Day 45',
                body: (
                  <p>
                    The system emails the manager a performance review with one required outcome: offer a full-time
                    contract, extend probation by 30 days, or terminate. An extension moves the contract start date
                    automatically. Fifteen days of buffer means the Day 60 deadline never arrives unanswered.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Day 60 promotes without paperwork',
                actor: 'system',
                cadence: 'Day 60',
                body: (
                  <p>
                    If the manager passed them, the system flips their status to full-time employee on the day and
                    sends the congratulations email, copying the manager and the recruiter who found them. Nobody
                    files anything; the milestone just happens.
                  </p>
                ),
              },
              {
                num: '06',
                title: 'Day 180 ends with a stay interview',
                actor: 'system',
                cadence: 'Day 180',
                body: (
                  <p>
                    Six months in, the Talent Director gets the prompt for a stay interview: what keeps you here, what
                    would make you leave, what should change. Most companies ask those questions in the exit
                    interview, when the answers can no longer help.
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
                <li>Every person gets an onboarding plan, uploaded before Day 1, no exceptions</li>
                <li>The calendar triggers every stage; no step waits on memory</li>
                <li>The Day 45 decision is always human; the system only executes it</li>
                <li>Nobody is promoted, extended, or terminated by a machine</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Daily nags make the plan deadline self-enforcing</li>
                <li>Day 8 catches problems while they are still cheap to fix</li>
                <li>Deciding at Day 45 removes the Day 60 scramble entirely</li>
                <li>One board shows a manager every report&apos;s onboarding at a glance</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
