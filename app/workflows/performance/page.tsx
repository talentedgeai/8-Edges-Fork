import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'A person notices the product feels slow, or a tracked metric moves the wrong way. The hunch is the start, not an automated alarm.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The codebase, the live database including row counts and indexes, and real user-path measurements. We read the system as it runs, not as we remember it.' },
  { name: 'Decision', assignment: 'both', desc: 'Measure before optimizing: is the cost the database, the round-trips, or the bytes? Machines surface the evidence, a human sets the target and owns the risk.' },
  { name: 'Routing', assignment: 'machine', desc: 'Findings fan out to independent reviewers, one per dimension, and each finding is adversarially verified before it earns a fix.' },
  { name: 'Output', assignment: 'machine', desc: 'A ranked action list: root cause in plain terms, the fix, the effort, and the exact files to touch. Nothing speculative.' },
  { name: 'Delivery', assignment: 'both', desc: 'Small, themed pull requests, each type-checked and built. A human reviews the risk and merges.' },
  { name: 'Measurement', assignment: 'both', desc: 'Before-and-after numbers on the metric that mattered. Machines produce them, a person decides whether the win is real. If it is not measured, it did not improve.' },
]

const title = 'How We Think About Speed | Edge8 Workflows'
const description =
  'When the product feels slow, we measure before we optimize and prove the win after. A human sets the target, AI finds and adversarially verifies the real bottleneck.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/performance/' },
  openGraph: { title, description, url: '/workflows/performance/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const PROBLEMS = [
  '"Slow" is a feeling, not a number, so teams optimize the part that feels obvious instead of the part actually costing time.',
  'The database gets blamed first. Usually the real cost is redundant network round-trips and oversized payloads.',
  'Plausible-sounding fixes ship without proof, then quietly do nothing, or make it worse.',
  'A big rewrite trades a slow system that works for a fast one that does not.',
]

export default function PerformanceWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Innovation"
        title="How We Think About Speed"
        tldr="When the product feels slow, we do not guess. We measure to find the real bottleneck, fan the review out across independent reviewers, adversarially verify every finding, ship the fixes as small reversible pull requests, and measure again to prove the win. A human sets the target and owns the risk. AI does the reading, the finding, and the verifying."
        meta={[
          { label: 'Rule', value: 'Measure first' },
          { label: 'Review', value: 'Human + AI' },
          { label: 'Every fix', value: 'Verified twice' },
        ]}
      />

      {/* The problem */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">The problem</span>
          <h2 className="section-title section-title--sm">
            Speed work goes wrong before it starts
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Performance is the easiest thing to work on and the easiest to work on badly:
          </p>
          <div className="wf-problems">
            {PROBLEMS.map((p) => (
              <div key={p} className="wf-problem">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="13" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The flow */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The flow
          </span>
          <h2 className="section-title section-title--sm">
            From a hunch to a proven win
          </h2>
          <FlowRail
            steps={[
              { num: '01', title: 'Notice', cadence: 'Something feels slow', actor: 'human', actorLabel: 'Operator' },
              { num: '02', title: 'Measure', cadence: 'Find the bottleneck', actor: 'ai', actorLabel: 'Claude' },
              { num: '03', title: 'Review', cadence: 'Dimension by dimension', actor: 'ai', actorLabel: 'Claude' },
              { num: '04', title: 'Refute', cadence: 'Try to break each finding', actor: 'ai', actorLabel: 'Claude' },
              { num: '05', title: 'Decide', cadence: 'Scope and risk', actor: 'human', actorLabel: 'Operator' },
              { num: '06', title: 'Ship', cadence: 'Typed, built, deployed', actor: 'system', actorLabel: 'CI + deploy' },
              { num: '07', title: 'Prove', cadence: 'Before and after', actor: 'human', actorLabel: 'Operator' },
            ]}
            repeatNote="The loop runs again the next time a number moves the wrong way."
          />
        </div>
      </section>

      {/* Step detail */}
      <section className="section">
        <div className="container">
          <span className="section-label">Step by step</span>
          <h2 className="section-title section-title--sm">
            How each step works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Notice the slowness',
                cadence: 'A human observation',
                actor: 'human',
                actorLabel: 'Operator',
                body: (
                  <p>
                    It starts with a person, not an alert: a page feels slower than it should, or a number moved the
                    wrong way. We write the hunch down as a plain question, like why the admin feels slow, and resist
                    naming a cause before we have measured one.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Measure before touching anything',
                cadence: 'Find the real bottleneck',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    Before a line of code changes, Claude establishes where the time actually goes. On our own admin
                    that meant pulling live database row counts and indexes: every table was under a thousand rows, so
                    the database was answering in microseconds. The real cost was elsewhere, in redundant round-trips
                    and oversized payloads. Measuring first is what stops you from indexing a table that was never slow.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Fan the review out by dimension',
                cadence: 'Independent reviewers',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    The review splits into independent lenses: over-fetching, request waterfalls, caching, client bundle
                    weight, database indexes, and repeated queries. Each reviewer sees only its own lens, so nothing
                    hides in the gap between two people's assumptions. Every finding cites the exact file, line, and the
                    offending code.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Try to break each finding',
                cadence: 'Adversarial verification',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    Every finding is handed to a skeptic whose job is to refute it. Is the code really doing what the
                    finding claims? Does it run on a hot path, or is it cold code that rarely executes? Would the fix
                    change behavior or weaken a guarantee? Only findings that survive earn a fix. Plausible-but-wrong is
                    the most expensive kind of wrong, and this is where it dies.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'A human sets scope and owns the risk',
                cadence: 'The decision',
                actor: 'human',
                actorLabel: 'Operator',
                body: (
                  <p>
                    A person decides which fixes ship now, which wait, and which touch something sensitive enough to
                    need a careful review of its own. On our admin, the change to the authentication path was pulled
                    into its own reviewable unit precisely so a human could weigh the tradeoff before it shipped. AI
                    proposes, a person decides.
                  </p>
                ),
              },
              {
                num: '06',
                title: 'Ship small, verified, reversible changes',
                cadence: 'Typed, built, deployed',
                actor: 'system',
                actorLabel: 'CI + deploy',
                body: (
                  <p>
                    Fixes ship as small pull requests grouped by theme, not piled into one. Each is type-checked and
                    built before it can merge, and each is reversible on its own. Small and verified keeps a fast system
                    a working system. Big-bang rewrites are how you trade a slow product for a broken one.
                  </p>
                ),
              },
              {
                num: '07',
                title: 'Prove the win with numbers',
                cadence: 'Before and after',
                actor: 'human',
                actorLabel: 'Operator',
                body: (
                  <p>
                    Then we measure again, and the numbers have to move. Round-trips per page, bundle size, time to
                    first byte, before and after, side by side. On this admin the authentication round-trips per request
                    dropped from three to one, the busiest page shed almost a third of its startup code, and the
                    dashboard stopped waiting on an outside service to draw. A change that cannot show its before and
                    after did not improve anything.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Why it works */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>Measure before you optimize, and again after to prove it</li>
                <li>The database is innocent until the row counts say otherwise</li>
                <li>No finding ships without surviving an adversarial second look</li>
                <li>Change only what traces to the goal, no speculative rewrites</li>
                <li>Anything sensitive gets its own reviewable change</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Effort lands on the real bottleneck, not the one that feels obvious</li>
                <li>Round-trips and bytes are where the milliseconds hide, so that is where the work goes</li>
                <li>Adversarial verification kills plausible-but-wrong fixes before they cost anyone</li>
                <li>Small, reversible changes keep a fast system a working one</li>
                <li>Every win comes with a number, so nobody takes "it feels faster" on faith</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
