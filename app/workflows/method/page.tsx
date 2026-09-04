import type { Metadata } from 'next'
import Link from 'next/link'
import { ElementsGrid } from '../ui'

const title = 'How We Design Workflows | Edge8'
const description =
  'The method behind every workflow we run: the 5D program brief, the seven elements of a workflow, the Centaur Map, the New Hire Test, and three stage gates.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/method/' },
  openGraph: { title, description, url: '/workflows/method/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const FIVE_DS = [
  { name: 'Define', assignment: 'human' as const, desc: 'Write the problem statement and a FAST goal. A workflow that cannot name its problem is a solution looking for one.' },
  { name: 'Datasources', assignment: 'both' as const, desc: 'Name every piece of data the workflow needs, where it lives, whether it is clean, and whether AI can reach it.' },
  { name: 'Diagram', assignment: 'both' as const, desc: 'Document the workflow end to end and draw it. The pages in this section are this D, published.' },
  { name: 'Determine ROI', assignment: 'human' as const, desc: 'Put a number on what the workflow saves or earns. If the return cannot be determined, the program does not start.' },
  { name: 'Deploy', assignment: 'both' as const, desc: 'Plan the rollout through the three stage gates: prototype, pilot, production.' },
]

const SEVEN_ELEMENTS = [
  { name: 'Trigger', assignment: 'machine' as const, desc: 'The event that starts the workflow. A form submission, a calendar date, a message. Named precisely, or the workflow starts on vibes.' },
  { name: 'Inputs', assignment: 'both' as const, desc: 'Everything the workflow consumes: documents, records, context. Each input names where it lives and who fetches it.' },
  { name: 'Decision', assignment: 'both' as const, desc: 'The judgment calls inside the flow, written as rules explicit enough that a new hire, or an AI, applies them the same way twice.' },
  { name: 'Routing', assignment: 'machine' as const, desc: 'Where work goes after each decision, including the exception paths that usually live in one person’s head.' },
  { name: 'Output', assignment: 'both' as const, desc: 'The artifact the workflow produces: a document, a record, a payment request, a ranked list.' },
  { name: 'Delivery', assignment: 'machine' as const, desc: 'How the output reaches the people who need it: a notification, a dashboard, an email, a published page.' },
  { name: 'Measurement', assignment: 'machine' as const, desc: 'What the workflow tracks about itself: cycle time, hit rate, follow-through. Untracked workflows cannot improve.' },
]

const FRAMEWORKS = [
  { name: 'Leadership Brandbook', use: 'Feeds the 1-1 coaching workflow with how each leader actually works.' },
  { name: 'EQ + Communication Guides', use: 'Personal datasets that let AI coach and draft in your own voice.' },
  { name: 'Employee Lifecycle Map', use: 'The frame behind hiring, onboarding, and the resume screen workflow.' },
  { name: 'GROW Coaching Model', use: 'The structure inside every 1-1 conversation and coaching profile.' },
  { name: 'Company Goals Cascade', use: 'Company goals connected to team and individual FAST goals, reviewed on a rhythm.' },
  { name: 'Retention Intelligence', use: 'Stay interviews and early-warning signals, run before notice is handed in.' },
  { name: 'Analytics Decision Brief', use: 'One real decision, framed properly, before any dashboard gets built.' },
  { name: 'Workflow Blueprint', use: 'The seven-element document behind every page in this section.' },
  { name: 'Innovation Sprint', use: 'Problem to tested prototype in one sitting, ending in kill, iterate, or scale.' },
  { name: 'ADKAR Change Plan', use: 'How a new workflow actually lands with the people who must adopt it.' },
]

export default function MethodPage() {
  return (
    <main>
      <section className="wf-hero">
        <div className="container">
          <div className="wf-hero-inner">
            <div className="wf-breadcrumb">
              <Link href="/workflows">Workflows</Link>
              <span>/</span>
              <span>Method</span>
            </div>
            <h1 className="site-section-title">How We Design Workflows</h1>
            <p className="wf-hero-sub">
              We ground every workflow in validated business and academic frameworks, not prompt tricks. From that
              foundation, one method carries each page in this section: plan the program with the 5Ds, document the
              workflow in seven elements, assign each element to a human or a machine, test the document, then ship
              through three stage gates. It is the same method we teach in the AI Officer certification, applied to
              our own company.
            </p>
            <div className="wf-hero-meta">
              <span className="wf-meta-chip">Grounding <strong>Validated frameworks</strong></span>
              <span className="wf-meta-chip">Planning <strong>5D Brief</strong></span>
              <span className="wf-meta-chip">Anatomy <strong>7 elements</strong></span>
              <span className="wf-meta-chip">Assignment <strong>Centaur Map</strong></span>
              <span className="wf-meta-chip">Quality <strong>New Hire Test</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* The invisibility problem */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">Why document at all</span>
          <h2 className="site-section-title site-section-title--sm">
            The invisibility problem
          </h2>
          <p className="site-section-sub u-mt-3">
            Every organization runs on workflows nobody has written down. They live in the heads of the people who run
            them, which means they stall when that person is out, they cannot be improved because they cannot be seen,
            and they can never be handed to AI. The work your team relies on most is usually the work that is least
            visible. Making it visible is the first job, and it is a leadership job, not a technical one.
          </p>
        </div>
      </section>

      {/* 5D */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="site-section-label wf-section--white">
            Step 1: Plan
          </span>
          <h2 className="site-section-title site-section-title--sm">
            The 5D Program Brief
          </h2>
          <p className="site-section-sub u-mt-3">
            No workflow gets built without a one-page brief covering five Ds. It keeps the program honest: a real
            problem, real data, a documented flow, a determined return, and a deployment plan.
          </p>
          <ElementsGrid elements={FIVE_DS} />
        </div>
      </section>

      {/* Seven elements */}
      <section className="section">
        <div className="container">
          <span className="site-section-label">Step 2: Document</span>
          <h2 className="site-section-title site-section-title--sm">
            Seven elements, every time
          </h2>
          <p className="site-section-sub u-mt-3">
            A workflow is not a paragraph, it is a structure. We break every one into the same seven elements. The
            assignment chips below show the typical split; every workflow page in this section carries its own map.
          </p>
          <ElementsGrid elements={SEVEN_ELEMENTS} />
        </div>
      </section>

      {/* Centaur + New hire test */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="site-section-label wf-section--white">
            Step 3: Assign and test
          </span>
          <h2 className="site-section-title site-section-title--sm">
            The Centaur Map and the New Hire Test
          </h2>
          <div className="wf-info-grid">
            <div className="wf-info-card wf-section--white">
              <h3>Centaur Map: human, machine, or both</h3>
              <ul>
                <li>Every element gets an explicit assignment based on comparative advantage</li>
                <li>Machines take triggers, routing, delivery, and measurement</li>
                <li>Humans keep judgment with consequences: approvals, hires, money</li>
                <li>Where the machine needs data it does not have yet, the map names it</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint wf-section--white">
              <h3>New Hire Test: the quality gate</h3>
              <ul>
                <li>Someone who has never run the workflow runs it from the document alone</li>
                <li>Every place they stall is a gap in the document, not in the person</li>
                <li>The weakest step is always an undocumented decision rule</li>
                <li>If a human cannot follow the document, neither can AI</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stage gates */}
      <section className="section">
        <div className="container">
          <span className="site-section-label">Step 4: Ship</span>
          <h2 className="site-section-title site-section-title--sm">
            Three stage gates
          </h2>
          <p className="site-section-sub u-mt-3">
            A documented workflow earns its way into production. It does not get declared into it.
          </p>
          <div className="wf-stages">
            <div className="wf-stage">
              <strong>S1 · Prototype</strong>
              <span>A clickable model of the workflow, built from the document</span>
            </div>
            <span className="wf-stage-arrow">→</span>
            <div className="wf-stage">
              <strong>S2 · Pilot</strong>
              <span>Run on a real slice of work, measured against a baseline</span>
            </div>
            <span className="wf-stage-arrow">→</span>
            <div className="wf-stage wf-stage-active">
              <strong>S3 · Production</strong>
              <span>Every workflow published in this section runs here</span>
            </div>
          </div>
        </div>
      </section>

      {/* Frameworks library */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="site-section-label wf-section--white">
            The library
          </span>
          <h2 className="site-section-title site-section-title--sm">
            The frameworks behind the workflows
          </h2>
          <p className="site-section-sub u-mt-3">
            The workflows in this section do not float free. They draw on a library of business frameworks we teach in
            our leadership and AI Officer programs, each one producing a dataset that AI can work from.
          </p>
          <div className="wf-elements">
            {FRAMEWORKS.map((f) => (
              <div key={f.name} className="wf-element">
                <div className="wf-element-head">
                  <span className="wf-element-name">{f.name}</span>
                </div>
                <p className="wf-element-desc">{f.use}</p>
              </div>
            ))}
          </div>
          <div className="wf-frameworks-cta">
            <div>
              <h3>Prompt frameworks are dead</h3>
              <p>Learn to apply real, tested academic and business frameworks to the problems you are trying to solve.</p>
            </div>
            <a href="https://www.ai-officer.com/100-business-frameworks" target="_blank" rel="noopener noreferrer" className="btn site-btn-secondary">
              Explore 100 Business Frameworks →
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container u-center-text">
          <h2 className="site-section-title wf-title-lg u-mb-3">
            This method is teachable. And buildable.
          </h2>
          <p className="site-section-sub u-mx-auto u-mb-6">
            We certify leaders in this method through the AI Officer program, and we build these workflows directly for
            clients. Either way, your invisible processes become systems.
          </p>
          <div className="u-row u-gap-3 u-center u-wrap">
            <Link href="/training-and-certification" className="btn site-btn-ghost-light">
              Explore certification
            </Link>
            <Link href="/contact" className="btn site-btn-secondary">
              Talk to Edge8 →
            </Link>
          </div>
          <p className="u-mt-6">
            <Link href="/workflows" className="wf-back wf-link-muted">
              ← All workflows
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
