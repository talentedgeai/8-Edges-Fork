import type { Metadata } from 'next'
import { WorkflowHero, ActorChip, StepCards, SevenElements, DetailFooter, type Actor, type WorkflowElement } from '../ui'

const title = 'Ideas Backlog | Edge8 Workflows'
const description =
  'Anyone on the team submits an idea through the 5D framework, AI turns it into a full product plan, and admins triage a backlog that arrives pre-thought.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/ideas-backlog/' },
  openGraph: { title, description, url: '/workflows/ideas-backlog/', type: 'website' },
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
    actorLabel: 'Team member',
    title: 'Submit an idea through 5D',
    desc: 'The portal form walks the idea through the five Ds, from the problem it solves to the return it could produce.',
  },
  {
    num: '2',
    lane: 'system',
    actor: 'ai',
    actorLabel: 'Claude',
    title: 'AI writes the product plan',
    desc: 'Claude expands the structured idea into a full product plan: approach, scope, and what it would take to build.',
  },
  {
    num: '3',
    lane: 'system',
    actor: 'system',
    actorLabel: 'System',
    title: 'Idea lands in the backlog',
    desc: 'The idea and its plan arrive in the innovation backlog together, ready to be judged.',
  },
  {
    num: '4',
    lane: 'admin',
    actor: 'human',
    actorLabel: 'Admin',
    title: 'Triage the backlog',
    desc: 'Admins review ideas with the plan already attached. The decision follows the innovation sprint logic.',
    outcomes: [
      { label: 'Build', kind: 'approve' },
      { label: 'Iterate', kind: 'info' },
      { label: 'Park', kind: 'reject' },
    ],
  },
  {
    num: '5',
    lane: 'contractor',
    actor: 'contractor',
    actorLabel: 'Team member',
    title: 'See the outcome',
    desc: 'The submitter sees where their idea went and why. Ideas that get parked get parked with a reason.',
  },
]

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'A team member has an idea. The system makes sure having one is never the hard part of sharing one.' },
  { name: 'Inputs', assignment: 'human', desc: 'The 5D form: the problem, the data involved, the shape of the solution, the return, and how it would deploy.' },
  { name: 'Decision', assignment: 'human', desc: 'Build, iterate, or park. Admins decide; the AI plan informs the call but never makes it.' },
  { name: 'Routing', assignment: 'machine', desc: 'Ideas flow to the backlog with their plan attached, and outcomes flow back to the submitter.' },
  { name: 'Output', assignment: 'machine', desc: 'A full product plan per idea, generated the moment the idea is submitted.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The innovation backlog page, where every idea and plan is reviewable in one place.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Ideas submitted, triaged, and built, so the pipeline from suggestion to shipped is visible.' },
]

export default function IdeasBacklogWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Innovation"
        title="Ideas Backlog"
        tldr="Anyone on the team submits an idea through the 5D framework, AI expands it into a full product plan, and admins triage a backlog where every idea arrives pre-thought."
        meta={[
          { label: 'Who can submit', value: 'Everyone' },
          { label: 'Plan per idea', value: 'AI-generated' },
          { label: 'Triage', value: 'Build · Iterate · Park' },
        ]}
      />

      {/* Swimlane */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            From suggestion to decision
          </h2>
          <p className="site-section-sub u-mt-3">
            Most idea programs die between the suggestion and the evaluation, because evaluating raw ideas is
            expensive. Here the expansion work happens automatically, so triage is cheap and nothing rots in the inbox.
          </p>

          <div className="wf-lanes-head">
            <div className="wf-lane-label wf-lane-label-admin">Admin</div>
            <div className="wf-lane-label wf-lane-label-system">System + AI</div>
            <div className="wf-lane-label wf-lane-label-contractor">Team member</div>
          </div>
          <div className="wf-lanes">
            {NODES.map((n) => (
              <div key={n.num} className={`wf-node wf-node-${n.lane}`}>
                <span className="wf-node-badge">{n.num}</span>
                <div className="u-mb-2">
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
                title: 'An idea goes through the 5Ds',
                actor: 'contractor',
                actorLabel: 'Team member',
                body: (
                  <p>
                    The submission form is the 5D framework we use for every AI program: define the problem, name the
                    data, sketch the design, estimate the return, and imagine the deployment. Structure at the front
                    door means quality in the backlog.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Claude writes the product plan',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    The moment an idea is submitted, Claude expands it into a full product plan: the approach, the
                    scope, the risks, and what building it would involve. The thinking that used to make evaluation
                    expensive now costs nothing.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'The backlog assembles itself',
                actor: 'system',
                body: (
                  <p>
                    Idea and plan land in the innovation backlog together. Nothing needs to be chased, formatted, or
                    forwarded before it can be judged.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Admins triage with sprint logic',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Every idea gets one of three calls, the same ending as our innovation sprints: build it, iterate on
                    it, or park it. A parked idea keeps its plan, so reviving it later starts from a draft instead of
                    from zero.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'The submitter sees the outcome',
                actor: 'contractor',
                actorLabel: 'Team member',
                body: (
                  <p>
                    Outcomes are visible to the person who submitted. People keep contributing ideas when they can see
                    the ideas going somewhere, and stop when they vanish into a suggestion box.
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
                <li>Every idea goes through the 5Ds, no free-form pitches</li>
                <li>Every idea gets a full AI plan before any human evaluates it</li>
                <li>Triage is build, iterate, or park, with a reason attached</li>
                <li>Submitters always see the outcome</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Cheap evaluation means no idea waits months for attention</li>
                <li>The 5D form filters vague wishes into real proposals</li>
                <li>Parked ideas keep their plans, so nothing is ever wasted work</li>
                <li>Visible outcomes keep the idea pipeline full</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
