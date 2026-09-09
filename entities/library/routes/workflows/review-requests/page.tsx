import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, SevenElements, DetailFooter, type WorkflowElement } from '../ui'
import { WorkflowGraph, GraphLegend } from '../graph'
import { REQUEST_AGENT, REVIEWER_FLOW, REVIEW_STATES } from './graphs'

const title = 'Review Requests: Any Reviewer, One Link | Edge8 Workflows'
const description =
  'How talent opens a probation or performance review for anyone, adds reviewers beyond the manager (a second lead, a client contact), and hands each one a link, all from the team assistant or one Reviews screen. Full control flow, review lifecycle, failure paths, and the build plan.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/review-requests/' },
  openGraph: { title, description, url: '/workflows/review-requests/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'both', desc: 'The scheduler opens cycles on their dates (probation at six weeks, mid-year, renewal). Talent opens or extends one on demand, from chat or the Reviews screen.' },
  { name: 'Inputs', assignment: 'human', desc: 'A subject name and one or more reviewer names or emails. Nothing else: the cycle type and the form follow from the subject&rsquo;s employment stage.' },
  { name: 'Decision', assignment: 'both', desc: 'The assistant resolves names to people and refuses to guess. Talent decides who reviews; the manager still owns the finalize step and the probation decision.' },
  { name: 'Routing', assignment: 'machine', desc: 'Team members open their link with their portal session. Anyone else gets a signed link bound to their email: no account, no portal seat. One review row per reviewer; the same form for everyone.' },
  { name: 'Output', assignment: 'machine', desc: 'One link per reviewer, and one review row per link in performance_reviews. The links are the deliverable; nothing is sent until someone asks.' },
  { name: 'Delivery', assignment: 'both', desc: 'The assistant replies with the links. Talent forwards them however the reviewer prefers; the optional email tool sends them on request.' },
  { name: 'Measurement', assignment: 'human', desc: 'The Reviews screen shows every open cycle, who has submitted, who is overdue, and which probations end without a finalized review. Zero of the last one is the target.' },
]

const EXCEPTIONS = [
  { when: 'Caller is not talent, admin, or the subject&rsquo;s manager', then: 'Refused, with who can do it', heard: 'The chat reply' },
  { when: 'Two people match the subject name', then: 'The assistant asks which, creates nothing', heard: 'The chat reply' },
  { when: 'No open cycle for the subject', then: 'One is opened the same way the scheduler would (self + manager rows)', heard: 'The chat reply names the new cycle' },
  { when: 'Subject has no manager on file', then: 'Cycle opens with the self row only; flagged', heard: 'Chat reply + the Reviews screen&rsquo;s "no manager" column' },
  { when: 'A reviewer matches nobody', then: 'That reviewer is skipped; the rest are added', heard: 'The chat reply lists the skipped name' },
  { when: 'Same reviewer asked twice', then: 'No-op: the existing row&rsquo;s link is returned again', heard: 'Nowhere, by design' },
  { when: 'External reviewer forwards their link', then: 'Whoever opens it reviews as them; the link is a credential, so the reply says so', heard: 'The chat reply, once' },
  { when: 'A link with a wrong or expired token', then: 'Not found; nothing about the review leaks', heard: 'The 404' },
  { when: 'Reviewer submits after the manager finalized', then: 'Row still accepted; shown as late on the review page', heard: 'The review page, marked late' },
  { when: 'Probation ends with no finalized manager review', then: 'Weekly reminder keeps firing; the Reviews screen shows it red', heard: 'Email + the Reviews screen' },
  { when: 'Notification fails to send', then: 'The row is already saved; the link still works', heard: 'Cron run log' },
]

const PRS = [
  {
    name: 'PR 1: Any reviewer on a cycle',
    does: 'Loosens the review table so a cycle can hold one row per reviewer, not one per rater kind, and adds two rater kinds: reviewer (another team member) and external (anyone with a name and an email). External rows carry the email and a signed token, so the link works without an account or a portal seat. The manager form is reused; its decision section stays manager-only.',
    see: 'Nothing new on screen yet. The review page lists every submitted review on a cycle, manager first, instead of assuming exactly one.',
    done: 'A cycle with a manager row plus two extra reviewer rows renders, both extra reviewers can submit through the existing runner, and the manager can still finalize. Existing cycles are untouched.',
  },
  {
    name: 'PR 2: Reviews in Talent',
    does: 'Adds Reviews under Talent in Edge8 OS: one table of every cycle, probation and performance, with subject, type, due date, each reviewer&rsquo;s status, and a red mark when a probation ends without a finalized review. A row opens a drawer where talent adds reviewers by name and copies each link.',
    see: 'A Reviews entry next to Probation in the Talent menu, and an "Add reviewer" drawer that returns a link the moment a name is picked.',
    done: 'Talent can add a second internal reviewer and an unregistered client contact to a live probation cycle from the drawer, copy both links, and both reviewers can submit.',
  },
  {
    name: 'PR 3: Ask the assistant',
    does: 'Gives the team assistant one write tool, request_review_link, gated to the talent director, admins, and the subject&rsquo;s manager. It walks the request diagram above: resolve the subject, open a cycle if none, resolve each reviewer, insert or reuse a row, and reply with the links. It never emails on its own.',
    see: 'Typing "send a probation review link for Ngoc to Quan and the client lead" returns two links and, if anyone could not be resolved, says who.',
    done: 'The three refusal paths (not allowed, ambiguous subject, unknown reviewer) each reply with a plain explanation and write nothing; the happy path writes exactly one row per new reviewer.',
  },
  {
    name: 'PR 4: Send it for me',
    does: 'Optional. Lets the assistant email a link to a reviewer when asked in so many words, using the existing transactional email path, and lets the Reviews drawer do the same with one button. Both log the send on the cycle.',
    see: 'A "Send link" button beside each reviewer in the drawer, and the assistant confirming what it sent and to whom.',
    done: 'A sent link is logged on the review row with a timestamp; sending twice is refused within a day.',
  },
]

export default function ReviewRequestsWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="Review Requests: Any Reviewer, One Link"
        tldr="Today a review has two raters: the person and their manager. Reality has more voices, a second lead, the client the person works for, a peer. This workflow lets talent add any of them to a probation or performance review and hand each one a link, from chat or one Reviews screen, without the manager losing the decision. This page is the plan, drawn branch by branch before it is built."
        meta={[
          { label: 'Source', value: 'Team assistant + Edge8 OS' },
          { label: 'Cadence', value: 'On demand, plus the daily scheduler' },
          { label: 'Human touchpoints', value: 'The ask, the reviews, the decision' },
        ]}
      />

      {/* Orientation */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The shape, in ten seconds</span>
          <h2 className="section-title section-title--sm">Ask, assign, review, decide</h2>
          <p className="section-sub u-mt-3">
            This rail is the orientation, not the workflow. The diagrams below are the truth: every branch, every
            refusal, and the lifecycle the review rows move through.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Cycle Opens', cadence: 'Scheduler, or on demand', actor: 'system' },
              { num: '02', title: 'Talent Asks', cadence: 'Chat or Reviews screen', actor: 'human', actorLabel: 'Talent' },
              { num: '03', title: 'Reviewers Resolved', cadence: 'Never guessed', actor: 'ai', actorLabel: 'Claude' },
              { num: '04', title: 'Links Returned', cadence: 'One per reviewer', actor: 'system' },
              { num: '05', title: 'Reviews Land', cadence: 'Each in their portal', actor: 'human', actorLabel: 'Reviewers' },
              { num: '06', title: 'Manager Finalizes', cadence: 'Sees every review', actor: 'human', actorLabel: 'Manager' },
              { num: '07', title: 'Decision Recorded', cadence: 'Probation only', actor: 'human', actorLabel: 'Manager' },
            ]}
          />
        </div>
      </section>

      {/* The request, real flow */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">The reality &middot; the request</span>
          <h2 className="section-title section-title--sm">From a sentence in chat to one link per reviewer</h2>
          <p className="section-sub u-mt-3">
            Five decisions stand between the ask and the links: may you, who, is there a cycle, who are they, and are
            they already on it. Each refusal ends by telling the human, never by inventing a person. The same path
            runs behind the &ldquo;Add reviewer&rdquo; button on the Reviews screen; chat is just the shorter way to reach it.
          </p>
          <WorkflowGraph
            graph={REQUEST_AGENT}
            caption="The request path. Green writes a review row; every red path ends in the chat reply with a reason, and the reply always lists who was skipped."
          />
          <GraphLegend
            items={[
              { kind: 'trigger', label: 'the ask' },
              { kind: 'decision', label: 'decision' },
              { kind: 'write', label: 'review row written' },
              { kind: 'flag', label: 'refuse and explain' },
              { kind: 'terminal', label: 'quiet no-op' },
              { kind: 'human', label: 'human touchpoint' },
            ]}
          />
        </div>
      </section>

      {/* The reviewer, real flow */}
      <section className="section">
        <div className="container">
          <span className="section-label">The reality &middot; the reviewer</span>
          <h2 className="section-title section-title--sm">What happens when the link is opened</h2>
          <p className="section-sub u-mt-3">
            A link is bound to one review row and one reviewer. Team members open it with their portal session;
            anyone else, a client contact for instance, gets a signed link tied to their email and needs no account
            at all. The form is the existing manager review with the decision section shown to the manager only, so
            every reviewer scores the same eleven dimensions.
          </p>
          <WorkflowGraph
            graph={REVIEWER_FLOW}
            caption="The reviewer path. The only red path is a wrong or stale token: it 404s rather than leaking whose review it is."
          />
          <GraphLegend
            items={[
              { kind: 'decision', label: 'decision' },
              { kind: 'write', label: 'review saved' },
              { kind: 'flag', label: 'not found' },
              { kind: 'terminal', label: 'closed' },
              { kind: 'human', label: 'human touchpoint' },
            ]}
          />
        </div>
      </section>

      {/* State machine */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">The lifecycle</span>
          <h2 className="section-title section-title--sm">What a review row may do</h2>
          <p className="section-sub u-mt-3">
            Every reviewer row moves through the same four states. Extra reviewers stop at submitted; only the
            manager&rsquo;s row is finalized, and only a finalized manager row unlocks the probation decision. The
            subject sees the manager&rsquo;s review once finalized and the other reviews only if the manager chooses
            to share them.
          </p>
          <WorkflowGraph
            graph={REVIEW_STATES}
            caption="Green arrows are machine moves; dashed arrows are human-only. The decision step exists only on probation cycles."
          />
          <GraphLegend
            items={[
              { kind: 'write', label: 'machine may move' },
              { kind: 'action', label: 'human only (dashed)' },
            ]}
          />
        </div>
      </section>

      {/* Exceptions */}
      <section className="section">
        <div className="container">
          <span className="section-label">When it goes sideways</span>
          <h2 className="section-title section-title--sm">Every exception has an owner</h2>
          <p className="section-sub u-mt-3">
            Each row is a condition the workflow will hit, what it does about it, and where a human hears about it.
            Silence is only ever by design.
          </p>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>What happens</th>
                  <th>Where you hear about it</th>
                </tr>
              </thead>
              <tbody>
                {EXCEPTIONS.map((r) => (
                  <tr key={r.when}>
                    <td dangerouslySetInnerHTML={{ __html: r.when }} />
                    <td dangerouslySetInnerHTML={{ __html: r.then }} />
                    <td dangerouslySetInnerHTML={{ __html: r.heard }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Contract */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">The contract</span>
          <h2 className="section-title section-title--sm">Data, permissions, and how we know it works</h2>
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>Reads and writes</h3>
              <ul>
                <li>Reads: team members and their managers, people on file, open review cycles</li>
                <li>Writes: one performance_reviews row per reviewer; a cycle&rsquo;s self and manager rows if none exist</li>
                <li>Idempotency key: subject + cycle + reviewer. Asking twice returns the same link</li>
                <li>Rater kinds: self, manager, reviewer (team), external (email + signed token)</li>
              </ul>
            </div>
            <div className="wf-info-card">
              <h3>Permissions</h3>
              <ul>
                <li>Assign reviewers: talent director, admins, the subject&rsquo;s manager</li>
                <li>Submit a review: the bound reviewer only; team by session, external by their signed link</li>
                <li>Finalize and decide: the manager only; talent and admins may read</li>
                <li>Subject sees: the finalized manager review, plus anything the manager shares</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>How we know it works</h3>
              <ul>
                <li>The Reviews screen shows every open cycle and every reviewer&rsquo;s status at a glance</li>
                <li>A probation ending without a finalized review is red until it isn&rsquo;t</li>
                <li>Every chat request ends in links or a stated reason; a silent reply is the bug</li>
                <li>Monthly eyeball: cycles with only a manager row. Fewer each month is the trend we want</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Build plan */}
      <section className="section">
        <div className="container">
          <span className="section-label">The build plan</span>
          <h2 className="section-title section-title--sm">Four pull requests, each shippable alone</h2>
          <p className="section-sub u-mt-3">
            The first three are the workflow; the fourth is a convenience. Each names what it does, what you will see,
            and when it is done.
          </p>
          <div className="wf-info-grid">
            {PRS.map((pr) => (
              <div className="wf-info-card" key={pr.name}>
                <h3>{pr.name}</h3>
                <ul>
                  <li><strong>What it does.</strong> <span dangerouslySetInnerHTML={{ __html: pr.does }} /></li>
                  <li><strong>What you&rsquo;ll see.</strong> {pr.see}</li>
                  <li><strong>Done when.</strong> {pr.done}</li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Anatomy + closing */}
      <section className="section wf-section--tint">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <p className="wf-lead u-mt-6">
            This extends the review cycle already running behind{' '}
            <Link href="/workflows/edge8-onboarding-cycle" className="u-accent">
              the onboarding cycle
            </Link>{' '}
            and{' '}
            <Link href="/workflows/one-on-one-coaching" className="u-accent">
              the 1-1 coaching cycle
            </Link>
            : same table, same form, more voices.
          </p>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
