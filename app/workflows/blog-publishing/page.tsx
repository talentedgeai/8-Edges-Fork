import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'human', desc: 'The weekly content schedule or an ad hoc idea. Content starts with a human wanting to say something.' },
  { name: 'Inputs', assignment: 'both', desc: 'The approved draft, the photos, and the site style guide that governs how every post is built.' },
  { name: 'Decision', assignment: 'human', desc: 'The approval gate, one explicit sentence: “Photos are in. Build the post.” Nothing ships without it.' },
  { name: 'Routing', assignment: 'machine', desc: 'Post type determines image placement rules: listicles get inline images, narratives get a hero.' },
  { name: 'Output', assignment: 'machine', desc: 'Optimized WebP images, a built post page, and an updated blog index, identical in structure every time.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Changes staged in git and deployed through the pipeline. The post is live without a manual upload.' },
  { name: 'Measurement', assignment: 'machine', desc: 'The publish log: slug, images, commit hash, and issues, one entry per post, forever traceable.' },
]

const title = 'How We Publish | Edge8 Workflows'
const description =
  'The four-stage pipeline behind every post on this site. A human creates and approves the content, Claude builds, checks, and logs the rest.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/blog-publishing/' },
  openGraph: { title, description, url: '/workflows/blog-publishing/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function BlogPublishingWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="How We Publish"
        tldr="Four stages from idea to live post. A human creates the content and gives one approval. Claude handles everything after that: images, build, index, and the log."
        meta={[
          { label: 'Human steps', value: '2' },
          { label: 'AI steps', value: '2' },
          { label: 'Approval gate', value: '1 sentence' },
        ]}
      />

      {/* The pipeline */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="site-section-label">The pipeline</span>
          <h2 className="site-section-title site-section-title--sm">
            Human in front, AI behind
          </h2>
          <p className="site-section-sub u-mt-3">
            The handoff is a single sentence: &ldquo;Photos are in. Build the post.&rdquo; Everything before it is
            human judgment. Everything after it is automated.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Content Creation', cadence: 'Weekly or ad hoc', actor: 'human' },
              { num: '02', title: 'Content Approval', cadence: 'The handoff', actor: 'human' },
              { num: '03', title: 'Website Creation', cadence: 'Automated', actor: 'ai', actorLabel: 'Claude' },
              { num: '04', title: 'Log & Done', cadence: 'Automated', actor: 'ai', actorLabel: 'Claude' },
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
            The four stages
          </h2>
          <StepCards
            steps={[
              {
                num: '01',
                title: 'Content Creation',
                cadence: 'Weekly schedule or ad hoc',
                actor: 'human',
                body: (
                  <p>
                    Posts start from the weekly content schedule or an ad hoc idea. Each one is drafted in its own
                    dated folder and iterated until the writing is right. No build work happens here, just words.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'Content Approval',
                cadence: 'The handoff',
                actor: 'human',
                body: (
                  <p>
                    The final human review. Photos get dropped into the post&apos;s source folder, and the approval is
                    one explicit sentence: <strong>&ldquo;Photos are in. Build the post.&rdquo;</strong> Nothing ships
                    without it.
                  </p>
                ),
              },
              {
                num: '03',
                title: 'Website Creation',
                cadence: 'Automated',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <>
                    <p>Claude turns the approved draft into a live-ready post:</p>
                    <ul>
                      <li>Converts raw photos to WebP, resized to a 1200px max width at 85% quality</li>
                      <li>Renames images descriptively and writes keyword-rich alt text</li>
                      <li>Builds the post page to the site style guide, with image placement rules per post type</li>
                      <li>Updates the blog index and stages the changes in git</li>
                    </ul>
                  </>
                ),
              },
              {
                num: '04',
                title: 'Log & Done',
                cadence: 'Automated',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    Every publish gets a log entry: the post slug, category, date, image filenames and where they were
                    placed, the commit hash, and any issues hit along the way. The log is the audit trail for the whole
                    pipeline.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Quality gates */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="site-wf-info-grid">
            <div className="site-wf-info-card">
              <h3>Quality gates before anything ships</h3>
              <ul>
                <li>Every image loads with a correct relative path</li>
                <li>Every image has descriptive alt text</li>
                <li>Filenames are lowercase with hyphens, no exceptions</li>
                <li>Navigation links resolve, and nothing extra sneaks in</li>
              </ul>
            </div>
            <div className="site-wf-info-card site-wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>One approval gate keeps humans in control of what gets said</li>
                <li>Automation keeps the build identical every single time</li>
                <li>The publish log means every post can be traced to a commit</li>
                <li>Writers write. Nobody hand-edits HTML or resizes photos.</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
