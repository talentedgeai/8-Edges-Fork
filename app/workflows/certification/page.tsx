import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'Challenge-Based Certification | Edge8 Workflows'
const description =
  'Certification earned through submitted proof of real work, challenge by challenge. The certificate certifies something that exists: a shipped AI program.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/certification/' },
  openGraph: { title, description, url: '/workflows/certification/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'A learner starts a mission. Each mission targets one real workflow from their own team.' },
  { name: 'Inputs', assignment: 'both', desc: 'The textbook, the guided prompt, and the learner’s real work: their team’s workflows, data, and goals.' },
  { name: 'Decision', assignment: 'both', desc: 'Does the deliverable pass? The AI Buddy checks completeness against the challenge; humans certify the program.' },
  { name: 'Routing', assignment: 'machine', desc: 'A passed challenge unlocks the next mission. The artifact from each mission feeds the one after it.' },
  { name: 'Output', assignment: 'human', desc: 'Proof artifacts: a 5D program brief, a packaged prompt, a wired workflow, and finally a program running in production.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Certification plus a portfolio of artifacts the learner keeps and their team keeps using.' },
  { name: 'Measurement', assignment: 'both', desc: 'Completeness per challenge, and the only metric that matters at the end: is the program shipped and running?' },
]

export default function CertificationWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Innovation"
        title="Challenge-Based Certification"
        tldr="Certification earned through submitted proof of real work, challenge by challenge. Attendance proves you were in the room. Artifacts prove you can do the work, and the certificate certifies something that exists."
        meta={[
          { label: 'Graded on', value: 'Completed challenges' },
          { label: 'Material', value: 'Your real workflows' },
          { label: 'Final proof', value: 'A shipped program' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Five steps, repeated per mission
          </h2>
          <p className="site-section-sub u-mt-3">
            The AI Officer program runs as six missions, each ending in a real artifact. The loop below runs inside
            every one of them, and each artifact becomes raw material for the next mission.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Start the Mission', cadence: 'Per mission', actor: 'human', actorLabel: 'Learner' },
              { num: '02', title: 'Work the Challenges', cadence: 'With an AI Buddy', actor: 'human', actorLabel: 'Learner' },
              { num: '03', title: 'Submit Proof', cadence: 'A real artifact', actor: 'human', actorLabel: 'Learner' },
              { num: '04', title: 'Completeness Check', cadence: 'AI + human', actor: 'ai' },
              { num: '05', title: 'Advance & Certify', cadence: 'Mission by mission', actor: 'system' },
            ]}
            repeatNote="Six missions, from planning an AI program to shipping it as working code in production."
          />
        </div>
      </section>

      {/* Step detail */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="site-section-label wf-section--white">
            Step by step
          </span>
          <h2 className="site-section-title site-section-title--sm">
            How the loop works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'The mission starts with real work',
                actor: 'human',
                actorLabel: 'Learner',
                body: (
                  <p>
                    Mission one is program planning: the learner picks a real workflow from their own team and writes a
                    5D brief for it. That choice matters, because the same workflow is what they build, wire, and ship
                    across the remaining missions. Nothing in the program is hypothetical.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Challenges are worked with an AI Buddy',
                actor: 'human',
                actorLabel: 'Learner',
                body: (
                  <p>
                    Each mission is a set of guided challenges done alongside an AI thinking partner. The learner is
                    practicing the three skills of the AI Officer craft: workflow design, organizing information, and
                    creating instructions.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Proof gets submitted, not attendance',
                actor: 'human',
                actorLabel: 'Learner',
                body: (
                  <p>
                    Every mission ends in an artifact: a program brief, a packaged AI tool a teammate can run, an
                    automated workflow, an agent with guardrails, and finally working code on a real stack. The
                    artifact is the submission.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'The check is completeness',
                actor: 'ai',
                body: (
                  <p>
                    The test is simple and honest: can you complete the challenge? The AI Buddy checks that the
                    artifact is genuinely complete, with a concrete goal and a real number where one is required, not a
                    vague idea. Complete work passes.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Certification certifies something real',
                actor: 'system',
                body: (
                  <p>
                    A passed mission unlocks the next. At the end, the learner holds a certification backed by a
                    portfolio, and their team holds something better: an AI program running on their actual work.
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
                <li>Every challenge is worked on the learner&apos;s real team workflows</li>
                <li>Every mission ends in a submitted artifact</li>
                <li>Grading is completeness: can you do the thing, yes or no</li>
                <li>The final mission ships to production, not to a slide deck</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Artifacts compound: each mission builds on the last one&apos;s output</li>
                <li>Real work means the ROI arrives during the program, not after it</li>
                <li>Completeness grading removes subjectivity from certification</li>
                <li>The portfolio outlives the course and keeps working</li>
              </ul>
            </div>
          </div>
          <p className="wf-lead u-mt-6">
            This is the same method documented across this whole section.{' '}
            <Link href="/training-and-certification" className="u-accent">
              Explore the Training &amp; Certification program →
            </Link>
          </p>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
