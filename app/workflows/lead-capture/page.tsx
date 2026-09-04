import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'A submission on the website contact form, the one front door for every inquiry.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The form fields plus any existing CRM history for that person or company.' },
  { name: 'Decision', assignment: 'both', desc: 'The spam gate decides what enters; humans decide how qualified leads move through the pipeline.' },
  { name: 'Routing', assignment: 'machine', desc: 'Real inquiries route into the CRM; junk routes to a reviewable archive with a reason attached.' },
  { name: 'Output', assignment: 'machine', desc: 'A deduplicated person record with lead state and the full inquiry attached.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The lead appears in the admin pipeline views the moment it exists.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Lead stages and conversion through the funnel, read live from the CRM, never assembled by hand.' },
]

const title = 'Lead Capture to CRM | Edge8 Workflows'
const description =
  'From a form submission to a customer record: a spam gate filters the noise automatically, and every real inquiry becomes a tracked lead in the CRM.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/lead-capture/' },
  openGraph: { title, description, url: '/workflows/lead-capture/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function LeadCaptureWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Revenue"
        title="Lead Capture to CRM"
        tldr="From a form submission to a customer record. A spam gate filters the noise before a human ever sees it, and every real inquiry becomes a tracked lead with a lifecycle."
        meta={[
          { label: 'Spam handling', value: 'Automatic' },
          { label: 'Manual data entry', value: '0 fields' },
          { label: 'Customer =', value: 'Won deal' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Six steps from form to customer
          </h2>
          <p className="site-section-sub u-mt-3">
            The gate does the dirty work up front. Everything that survives it is a real person, already in the CRM,
            already assigned a stage.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Form Submission', cadence: 'Website', actor: 'contractor', actorLabel: 'Visitor' },
              { num: '02', title: 'Spam Gate', cadence: 'Automatic', actor: 'system' },
              { num: '03', title: 'Inquiry Created', cadence: 'Automatic', actor: 'system' },
              { num: '04', title: 'Lead Record', cadence: 'Automatic', actor: 'system' },
              { num: '05', title: 'Lifecycle Stages', cadence: 'Human-driven', actor: 'human' },
              { num: '06', title: 'Won = Customer', cadence: 'Deal closes', actor: 'human' },
            ]}
          />
          <div className="site-wf-loop-note">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>
              Submissions that fail the gate are archived automatically, never deleted. A human can review the archive
              any time, so a false positive costs a click, not a lost lead.
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
            How each step works
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'A visitor submits the contact form',
                actor: 'contractor',
                actorLabel: 'Visitor',
                body: (
                  <p>
                    Every inquiry enters through one form on the website. One front door means one pipeline to secure,
                    measure, and improve.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The spam gate decides',
                actor: 'system',
                body: (
                  <>
                    <p>
                      Before anything touches the CRM, an automatic gate evaluates the submission. Real inquiries pass
                      through untouched. Junk is archived with a reason attached.
                    </p>
                    <div className="site-wf-outcomes">
                      <span className="site-wf-outcome site-wf-outcome-approve">Pass → CRM</span>
                      <span className="site-wf-outcome site-wf-outcome-reject">Spam → Archived</span>
                    </div>
                  </>
                ),
              },
              {
                num: '03',
                title: 'An inquiry is created',
                actor: 'system',
                body: (
                  <p>
                    Passing submissions become inquiry records automatically: who wrote, what they asked, and when. No
                    copy-paste from an inbox, ever.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'The person becomes a lead',
                actor: 'system',
                body: (
                  <p>
                    The system creates or updates the person&apos;s CRM record and attaches lead state to it. If they
                    have written before, the history is already there. One person, one record, no duplicates.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'The lead moves through lifecycle stages',
                actor: 'human',
                body: (
                  <p>
                    From here humans take over: qualify, converse, propose. The lead&apos;s stage is updated in the CRM
                    as it moves, so the pipeline view is always the truth, not a weekly guess.
                  </p>
                ),
              },
              {
                num: '06',
                title: 'A won deal makes a customer',
                actor: 'human',
                body: (
                  <p>
                    Customer is not a label anyone types. It is a state the company record earns when a deal is won.
                    The definition is structural, so reports never argue about who counts.
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
                <li>One form, one pipeline, no side doors</li>
                <li>Spam is archived automatically, never silently deleted</li>
                <li>People and companies are deduplicated by the system, not by memory</li>
                <li>Customer status comes from won deals, not from a checkbox</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Humans only ever see real inquiries, so response time stays fast</li>
                <li>Zero manual entry means the CRM never drifts from reality</li>
                <li>Archived spam is reviewable, so the gate is accountable</li>
                <li>Structural definitions make every pipeline report trustworthy</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
