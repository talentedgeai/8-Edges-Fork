import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'Survey Collection | Edge8 Workflows'
const description =
  'Create a survey, share one link, and watch responses land in the admin in real time. Structured feedback without the spreadsheet.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/surveys/' },
  openGraph: { title, description, url: '/workflows/surveys/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'Someone needs an answer from a group: a cohort, a client team, an audience.' },
  { name: 'Inputs', assignment: 'human', desc: 'The questions. The hardest part of a survey is deciding what you actually need to know.' },
  { name: 'Decision', assignment: 'human', desc: 'What the responses mean and what to do about them. Data collection is automated; interpretation is not.' },
  { name: 'Routing', assignment: 'machine', desc: 'Every response flows to the same admin collection the moment it is submitted.' },
  { name: 'Output', assignment: 'machine', desc: 'A structured response set, one record per person, no copy-paste consolidation.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Responses are readable in the admin in real time, from the first submission.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Response counts and completion, visible while the survey is still open, so low turnout gets chased early.' },
]

export default function SurveysWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Survey Collection"
        tldr="Create a survey, share one link, and watch responses land in the admin in real time. Structured feedback without a spreadsheet, a form tool subscription, or a consolidation afternoon."
        meta={[
          { label: 'Distribution', value: 'One link' },
          { label: 'Consolidation', value: 'None needed' },
          { label: 'Visibility', value: 'Real time' },
        ]}
      />

      {/* The flow */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The flow</span>
          <h2 className="site-section-title site-section-title--sm">
            Four steps, one link
          </h2>
          <FlowRail
            steps={[
              { num: '01', title: 'Create the Survey', cadence: 'Minutes', actor: 'human', actorLabel: 'Admin' },
              { num: '02', title: 'Share the Link', cadence: 'Any channel', actor: 'human', actorLabel: 'Admin' },
              { num: '03', title: 'Responses Land', cadence: 'Real time', actor: 'system' },
              { num: '04', title: 'Review in Admin', cadence: 'While it runs', actor: 'human', actorLabel: 'Admin' },
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
                title: 'Create the survey',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Questions are defined once in the system. Because surveys live where the rest of the operation
                    lives, there is no separate form tool, no export step, and no account to manage.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Share one link',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    The survey has a public link that works anywhere: a chat, an email, a QR code in a room. One link
                    per survey means one pipe for all responses.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Responses land as they happen',
                actor: 'system',
                body: (
                  <p>
                    Each submission becomes a structured record the moment it arrives. Nobody consolidates, nobody
                    retypes, and the tenth response is stored exactly like the first.
                  </p>
                ),
              },
              {
                num: '04',
                title: 'Review while it runs',
                actor: 'human',
                actorLabel: 'Admin',
                body: (
                  <p>
                    Responses are readable in the admin from the first submission. If turnout is low or a question is
                    being misread, you find out while there is still time to fix it, not after the survey closes.
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
          <div className="site-wf-info-grid">
            <div className="site-wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>One link per survey, one pipe for responses</li>
                <li>Responses are records, never spreadsheet rows to reconcile</li>
                <li>Results stay in the same system as the rest of the operation</li>
                <li>Interpretation is a human job, always</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Zero consolidation means results are ready the moment the survey closes</li>
                <li>Real-time visibility catches low turnout while it is fixable</li>
                <li>Structured records make every survey comparable to the last one</li>
                <li>No extra tool means no extra place for data to go stale</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
