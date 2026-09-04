import type { Metadata } from 'next'
import {
  WorkflowHero,
  ActorChip,
  FlowRail,
  StepCards,
  SevenElements,
  DetailFooter,
  type Actor,
  type WorkflowElement,
} from '../ui'

const title = 'New Member Onboarding | Edge8 Workflows'
const description =
  'A recruiter marks an applicant hired, and the paperwork and the welcome start together: a self-serve form promotes the same record to pre-boarding while a 30-day nurture drip introduces Edge8, landing the new member at Day 1 with a portal account waiting.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/new-member-onboarding/' },
  openGraph: { title, description, url: '/workflows/new-member-onboarding/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

// Swimlane nodes for the core flow. Lanes: Recruiter (admin) · System · New member (contractor).
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
    actorLabel: 'Recruiter',
    title: 'Mark the applicant hired',
    desc: 'On the job requisition, the recruiter moves the chosen applicant to hired. This single decision starts both the paperwork and the nurture drip.',
  },
  {
    num: '2',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Recruiter',
    title: 'Set up the Lark email',
    desc: 'In parallel, the recruiter creates the @edge8.ai Lark account by hand and records it in 8 Edges. It runs alongside and never holds up the portal invite.',
  },
  {
    num: '3',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Send the onboarding email',
    desc: 'The moment the hire is marked, an onboarding email goes out with a private, single-use form link. It doubles as the Day 0 welcome, sent under the recruiter name.',
  },
  {
    num: '4',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Run the 30-day nurture drip',
    desc: 'Alongside the paperwork, a scheduled drip of seven touches introduces Edge8 across the notice period. Fully automated, with two human touches. Detailed below.',
  },
  {
    num: '5',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'New member',
    title: 'Complete the onboarding form',
    desc: 'Self-serve, any time in the window. Contact, emergency contact, banking, and identity, the details only they can provide.',
  },
  {
    num: '6',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Promote to pre-boarding',
    desc: 'On submit, the existing applicant record is matched and promoted in place, never duplicated. Sensitive fields land in the restricted store. No applicant on file routes a backfill notice to operations.',
  },
  {
    num: '7',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Send the portal invite',
    desc: 'Completing the form sends a portal invite to their personal email. No admin ticket, and no wait on the Lark account.',
  },
  {
    num: '8',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'New member',
    title: 'Log in on Day 1',
    desc: 'First login lands on their onboarding home: what they submitted, their probation details, and the benefits surface we keep building out.',
  },
]

// The 30-day pre-boarding nurture drip. Fully automated except two touches that are human by rule:
// a recruiter welcome to open (Day 0) and a manager note to close (Day 30).
type Touch = {
  num: string
  day: string
  title: string
  actor: 'system' | 'human'
  actorLabel: string
  body: React.ReactNode
}

const DRIP: Touch[] = [
  {
    num: '01',
    day: 'Day 0',
    title: 'Welcome',
    actor: 'human',
    actorLabel: 'Recruiter',
    body: (
      <p>
        The onboarding email doubles as a personal welcome, sent under the recruiter&rsquo;s name. It confirms the offer
        and start date, previews the next few weeks so nothing is a surprise, and carries the single-use link to the
        onboarding form. This is the one touch that is deliberately human on the way in.
      </p>
    ),
  },
  {
    num: '02',
    day: 'Day 2',
    title: 'Who we are',
    actor: 'system',
    actorLabel: 'System',
    body: (
      <p>
        An automated note that tells the Edge8 story: the operator lineage from Microsoft to Vinasource to TINYpulse,
        and the point of view that it is not an AI problem, it is the data. Context and something to be proud of, well
        before Day 1.
      </p>
    ),
  },
  {
    num: '03',
    day: 'Day 7',
    title: 'The six values',
    actor: 'system',
    actorLabel: 'System',
    body: (
      <p>
        How we work, one line each: Leverage Intelligence, Deliver Impact, Communicate Transparently, Act With
        Ownership, Learn and Share, and Have Fun Building. Sent automatically, with a light prompt to reply with the
        value that resonates most.
      </p>
    ),
  },
  {
    num: '04',
    day: 'Day 14',
    title: 'Meet the team',
    actor: 'system',
    actorLabel: 'System',
    body: (
      <p>
        An automated introduction to their manager and the people they are about to work with: faces, roles, and where
        they will sit. Belonging started early is the biggest driver of a strong first week.
      </p>
    ),
  },
  {
    num: '05',
    day: 'Day 21',
    title: 'Your first day',
    actor: 'system',
    actorLabel: 'System',
    body: (
      <p>
        A preview of Day 1: what it looks like, who they will meet, the start time, and one light piece of pre-reading.
        Never homework, just enough that they arrive oriented.
      </p>
    ),
  },
  {
    num: '06',
    day: 'Day 27',
    title: 'Get set up',
    actor: 'system',
    actorLabel: 'System',
    body: (
      <p>
        The logistics sweep three days out: a nudge if the form is not done, their Lark @edge8.ai credentials, the tools
        they will need, and where to be. Everything provisioned before they walk in.
      </p>
    ),
  },
  {
    num: '07',
    day: 'Day 30',
    title: 'See you tomorrow',
    actor: 'human',
    actorLabel: 'Manager',
    body: (
      <p>
        A short, warm note from the manager the day before: start time, the first thing to do, and a genuine glad you
        are joining. The second deliberately human touch, this time on the eve of Day 1.
      </p>
    ),
  },
]

const ELEMENTS: WorkflowElement[] = [
  {
    name: 'Trigger',
    assignment: 'human',
    desc: 'A recruiter marks an applicant hired in the ATS. That single decision starts the paperwork and the nurture drip at the same time.',
  },
  {
    name: 'Inputs',
    assignment: 'both',
    desc: 'The record the applicant built during hiring, the onboarding details only they can supply, the Lark @edge8.ai email the recruiter provisions, and the ready-made intro-to-Edge8 content the drip sends.',
  },
  {
    name: 'Decision',
    assignment: 'human',
    desc: 'The recruiter decides to hire and the new member decides to accept and complete their form. Two more are human touches by rule: the recruiter welcome to open and the manager note to close. The manager also makes the Day 60 pass.',
  },
  {
    name: 'Routing',
    assignment: 'machine',
    desc: 'The hire event fans out: the onboarding email and form link, the scheduled 30-day drip, the applicant match, and the portal invite. A direct hire with no applicant on file routes a backfill notice to operations.',
  },
  {
    name: 'Output',
    assignment: 'machine',
    desc: 'One record that advances through a clear lifecycle: pre-boarding on submit, probation on day one, and full-time with a labor contract at day sixty if they pass. Promoted in place from the applicant, never duplicated.',
  },
  {
    name: 'Delivery',
    assignment: 'machine',
    desc: 'The onboarding email, seven scheduled nurture touches, and the portal invite all send automatically, so the new member is welcomed and walked in without a single handoff.',
  },
  {
    name: 'Measurement',
    assignment: 'machine',
    desc: 'Every stage transition is stamped, and the drip records which touches sent and where a hire goes quiet, so silence becomes a signal instead of a surprise.',
  },
]

export default function NewMemberOnboardingWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="New Member Onboarding"
        tldr="Hiring ends where onboarding begins. The moment a recruiter marks an applicant hired, the paperwork and the welcome start together. A self-serve form promotes the same record to pre-boarding with a portal account waiting, while a 30-day nurture drip introduces Edge8 across the notice period. Seven touches, fully automated, with a recruiter welcome to open and a manager note to close. Both land the new member at Day 1 ready to start."
        meta={[
          { label: 'Lifecycle stages', value: '3' },
          { label: 'Probation', value: '60 days' },
          { label: 'Nurture touches', value: '7' },
        ]}
      />

      {/* Swimlane flow */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">The flow</span>
          <h2 className="section-title section-title--sm">
            Three lanes, two tracks
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Work passes between the recruiter, the system, and the new member. It is not a single line: the hire starts
            a transactional track and a nurture track at once, and both land at Day 1. The system carries every handoff,
            so nobody has to remember to follow up.
          </p>

          <div className="wf-lanes-head">
            <div className="wf-lane-label wf-lane-label-admin">Recruiter</div>
            <div className="wf-lane-label wf-lane-label-system">System</div>
            <div className="wf-lane-label wf-lane-label-contractor">New member</div>
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
          <div className="wf-loop-note">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 014-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 01-4 4H3" />
            </svg>
            <span>
              The two tracks run in parallel through the notice window. The transactional track promotes the record and
              issues the portal account; the nurture track, shown next, keeps the new member warm and introduces Edge8.
              Both converge at first login on Day 1.
            </span>
          </div>
        </div>
      </section>

      {/* The nurture drip */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The nurture drip
          </span>
          <h2 className="section-title section-title--sm">
            Seven touches over thirty days
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            The drip runs in English, to the new member&rsquo;s personal email, fully automated. It is warm on purpose
            and light on purpose: someone still working a notice period does not need a daily barrage, only enough to
            feel they made the right call and to walk in already knowing us. Two touches are human by rule; the numbered
            markers below are dark for a human and green for the system.
          </p>

          <FlowRail
            steps={DRIP.map((t) => ({
              num: t.num,
              title: t.title,
              cadence: t.day,
              actor: t.actor,
              actorLabel: t.actorLabel,
            }))}
          />

          <div style={{ marginTop: 8 }}>
            <StepCards
              steps={DRIP.map((t) => ({
                num: t.num,
                title: t.title,
                cadence: t.day,
                actor: t.actor,
                actorLabel: t.actorLabel,
                body: t.body,
              }))}
            />
          </div>
        </div>
      </section>

      {/* The recruiter checklist */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">Who does what</span>
          <h2 className="section-title section-title--sm">
            The recruiter checklist
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Almost everything is automated. What is left is a short list the recruiter owns by hand, in parallel with the
            flow. The drip never waits on it.
          </p>
          <div className="wf-open">
            <h3>Recruiter, by hand</h3>
            <p>Run alongside the automated flow, per new hire.</p>
            <ul>
              <li>Create the Lark @edge8.ai account and record it in 8 Edges</li>
              <li>Send the Day 0 welcome, the onboarding email personalized under their name</li>
              <li>Confirm the onboarding form is submitted; chase it personally if the drip goes quiet</li>
              <li>Verify portal access and tools work before Day 1</li>
              <li>Line up the manager for the Day 30 see-you-tomorrow note</li>
              <li>On an off-ramp, set the status and deactivate the portal account if the offer was rescinded</li>
            </ul>
          </div>
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>What the humans own</h3>
              <ul>
                <li>Recruiter: the hire, the Day 0 welcome, the Lark account, and the checklist above</li>
                <li>New member: completing the onboarding form and logging in on Day 1</li>
                <li>Manager: the Day 30 note and the Day 60 pass or fail decision</li>
                <li>Operations: backfilling a direct hire who has no applicant on file</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>What the machine owns</h3>
              <ul>
                <li>The onboarding email and its single-use form link</li>
                <li>Five of the seven drip touches, on a fixed schedule</li>
                <li>Matching the applicant and promoting the record in place</li>
                <li>The portal invite, sent on form completion</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Status lifecycle */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The status lifecycle
          </span>
          <h2 className="section-title section-title--sm">
            Pre-boarding, probation, then permanent
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Completing the form does not make someone a full employee on the spot. It moves them into pre-boarding, and
            their status advances on a clock everyone can see.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Pre-boarding', cadence: 'On submit', actor: 'system' },
              { num: '02', title: 'On Probation', cadence: 'Day 1', actor: 'system' },
              { num: '03', title: 'Full-Time + Labor Contract', cadence: 'Day 60, if passed', actor: 'human', actorLabel: 'Manager' },
            ]}
          />
        </div>
      </section>

      {/* Off-ramps */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">When it does not work out</span>
          <h2 className="section-title section-title--sm">
            The off-ramps
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Not every start finishes, and the record has to say so plainly. Three exit statuses close the loop, and none
            of them turns into an alumni record.
          </p>
          <div className="wf-elements">
            <div className="wf-element">
              <div className="wf-element-head">
                <span className="wf-element-name">Declined Offer</span>
              </div>
              <p className="wf-element-desc">
                The hire never accepts and never completes onboarding. The recruiter marks the record Declined Offer and
                it goes no further.
              </p>
            </div>
            <div className="wf-element">
              <div className="wf-element-head">
                <span className="wf-element-name">Rescinded</span>
              </div>
              <p className="wf-element-desc">
                They accepted, then changed their mind. The recruiter deactivates the portal account and marks the
                record Rescinded, so the reversal is on the books.
              </p>
            </div>
            <div className="wf-element">
              <div className="wf-element-head">
                <span className="wf-element-name">Failed Probation</span>
              </div>
              <p className="wf-element-desc">
                They started but did not pass the 60-day window. The record is marked Failed Probation rather than moving
                to full-time.
              </p>
            </div>
          </div>
          <p className="section-sub" style={{ marginTop: 24 }}>
            None of these become alumni. Alumni is reserved for people who genuinely worked here and moved on, not offers
            that fell through or probations that did not pass.
          </p>
        </div>
      </section>

      {/* Anatomy + rules */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>Only a hired applicant triggers onboarding; the recruiter owns that call</li>
                <li>The hire starts two tracks at once, a transactional spine and a 30-day nurture drip, both landing at Day 1</li>
                <li>The notice window is never dead air; the drip runs seven intro touches in English to the personal email</li>
                <li>Two touches are human by rule, a recruiter welcome on Day 0 and a manager note on Day 30; the rest send automatically</li>
                <li>A submission promotes the existing record; it never creates a second one</li>
                <li>Completing the form means pre-boarding, not full employment: probation starts on day one, full-time comes at day sixty on a pass</li>
                <li>Off-ramps are explicit: Declined Offer, Rescinded (account deactivated), and Failed Probation, and none of them become alumni</li>
                <li>Banking and identity data live in the restricted store, out of the general record</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>The gap between accept and Day 1 is where hires ghost; a warm, automated drip closes it</li>
                <li>Company story, values, and team intros land before Day 1, so day one is about people, not orientation</li>
                <li>The applicant and the employee are the same record, so nothing is retyped or lost</li>
                <li>A quiet drip is an early warning, not a mystery: silence cues a personal recruiter reach-out</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
