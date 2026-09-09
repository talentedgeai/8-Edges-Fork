import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, SevenElements, DetailFooter, type WorkflowElement } from '../ui'
import { WorkflowGraph, GraphLegend } from '../graph'
import { BOOKING_AGENT, CALL_AGENT, LEAD_STATES } from './graphs'

const title = 'Lark Scheduler to CRM Updates | Edge8 Workflows'
const description =
  'Two scheduled agents bracket every sales call: one turns each external calendar booking into a CRM lead before the call, and one turns each recorded call into a complete CRM record, a drafted follow-up, and a coaching note after it. Full control flow, state machine, and failure paths included.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/lark-scheduler-to-crm-updates/' },
  openGraph: { title, description, url: '/workflows/lark-scheduler-to-crm-updates/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'Time, twice a day. 6am catches the bookings that arrived overnight; 6pm catches the calls that happened since.' },
  { name: 'Inputs', assignment: 'machine', desc: 'Calendar events with external guests, and the day&rsquo;s meeting transcripts from Lark Minutes. Both already exist; nobody types anything.' },
  { name: 'Decision', assignment: 'both', desc: 'The agents decide what is external, who matches whom, and how a lead advances. Anything uncertain is skipped and flagged for the human, never guessed.' },
  { name: 'Routing', assignment: 'machine', desc: 'Internal meetings and 1-1s are filtered out. Only genuine external conversations reach the CRM.' },
  { name: 'Output', assignment: 'machine', desc: 'CRM rows: person, company, lead, meeting with full transcript, interactions, lifecycle transitions. Plus one drafted follow-up email per call.' },
  { name: 'Delivery', assignment: 'machine', desc: 'A morning Lark message listing new leads, and an evening one per day with calls: CRM links, the waiting draft, and two coaching notes.' },
  { name: 'Measurement', assignment: 'human', desc: 'The pipeline is inspectable at any hour: every lead has a source, every deal has a next step with a date, every call has a transcript behind it.' },
]

const EXCEPTIONS = [
  { when: 'Booking has no guest email', then: 'Skipped, nothing created', heard: 'Morning DM, with the event named' },
  { when: 'Guest uses a free-mail address', then: 'Person and lead created, no company invented', heard: 'Morning DM' },
  { when: 'Guest is already an active lead or client', then: 'Record enriched, meeting logged, status untouched', heard: 'Morning DM, listed as skipped' },
  { when: 'Lark auth or scope failure', then: 'Run aborts before any write', heard: 'Task run log; the missing DM is the tell' },
  { when: 'Call was not recorded', then: 'No transcript exists; CRM entry falls to the human', heard: 'Evening DM names the gap' },
  { when: 'Transcript still processing at 6pm', then: 'Flagged, retried on the next run', heard: 'Evening DM' },
  { when: 'Speaker matches nobody confidently', then: 'Call skipped entirely, never guessed', heard: 'Evening DM, flagged for manual triage' },
  { when: 'Transcript garbles names (ASR)', then: 'Names normalized against the CRM before writing', heard: 'Noted on the meeting record' },
  { when: 'The DM itself fails to send', then: 'Summary printed to the run log; writes are already safe', heard: 'Task run log' },
  { when: 'Same event or recording seen again', then: 'No-op by key, never a duplicate', heard: 'Nowhere, by design' },
]

export default function LarkSchedulerToCrmUpdatesWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Revenue"
        title="Lark Scheduler to CRM Updates"
        tldr="A prospect books a call, the call happens, and the pipeline quietly falls behind the calendar unless someone types it all in. Two scheduled agents close that gap. This page documents the workflow the way it actually runs: every branch, every failure path, and the state machine underneath, not just the happy path."
        meta={[
          { label: 'Source', value: 'Lark Calendar + Minutes' },
          { label: 'Cadence', value: 'Daily, 6am and 6pm' },
          { label: 'Human touchpoints', value: 'The call, the send' },
        ]}
      />

      {/* Orientation */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The shape, in ten seconds</span>
          <h2 className="section-title section-title--sm">Two agents, bracketing the call</h2>
          <p className="section-sub u-mt-3">
            This rail is the orientation, not the workflow. Real life branches, fails, and loops; the diagrams below
            are the truth, drawn branch by branch.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Booking Lands', cadence: 'Scheduling link', actor: 'system' },
              { num: '02', title: 'Lead Created', cadence: '6am daily', actor: 'ai', actorLabel: 'Claude' },
              { num: '03', title: 'The Call Happens', cadence: 'Recorded in Lark', actor: 'human', actorLabel: 'Owner' },
              { num: '04', title: 'Transcript Lands', cadence: 'Automatic', actor: 'system' },
              { num: '05', title: 'CRM Caught Up', cadence: '6pm daily', actor: 'ai', actorLabel: 'Claude' },
              { num: '06', title: 'Follow-up Drafted', cadence: 'Never auto-sent', actor: 'ai', actorLabel: 'Claude' },
              { num: '07', title: 'Report + Coaching', cadence: 'One Lark message', actor: 'system' },
            ]}
          />
        </div>
      </section>

      {/* Agent 1, real flow */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            The reality &middot; agent 1
          </span>
          <h2 className="section-title section-title--sm">Booking to lead, every branch</h2>
          <p className="section-sub u-mt-3">
            Seven boxes in the rail; four decisions, three write paths, and two quiet endings in reality. The
            interesting work is in the branches: recognising who is already known, refusing to demote anyone, and
            ending in silence when there is nothing to say.
          </p>
          <WorkflowGraph
            graph={BOOKING_AGENT}
            caption="The morning agent. Green boxes write to the CRM; the red path ends by telling a human instead of guessing."
          />
          <GraphLegend
            items={[
              { kind: 'trigger', label: 'schedule fires' },
              { kind: 'decision', label: 'decision' },
              { kind: 'write', label: 'CRM write' },
              { kind: 'flag', label: 'flag a human' },
              { kind: 'terminal', label: 'quiet end' },
              { kind: 'human', label: 'human touchpoint' },
            ]}
          />
        </div>
      </section>

      {/* Agent 2, real flow */}
      <section className="section">
        <div className="container">
          <span className="section-label">The reality &middot; agent 2</span>
          <h2 className="section-title section-title--sm">Call to CRM, every branch</h2>
          <p className="section-sub u-mt-3">
            The evening agent runs four gates before it writes anything: external, unseen, transcribed, matched. Only
            then does the transcript become CRM records, and only a priced opportunity becomes a deal. The follow-up is
            drafted, never sent; the day ends in one message to the owner.
          </p>
          <WorkflowGraph
            graph={CALL_AGENT}
            caption="The evening agent. The amber pill defers to the next run; both red paths surface in the DM rather than guessing."
          />
          <GraphLegend
            items={[
              { kind: 'decision', label: 'decision' },
              { kind: 'write', label: 'CRM write' },
              { kind: 'wait', label: 'retry next run' },
              { kind: 'flag', label: 'flag a human' },
              { kind: 'human', label: 'human touchpoint' },
            ]}
          />
        </div>
      </section>

      {/* State machine */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            The state machine
          </span>
          <h2 className="section-title section-title--sm">What the agents may do to a lead</h2>
          <p className="section-sub u-mt-3">
            Underneath both agents sits one entity with rules: the lead. The agents may create a lead at meeting
            booked, step it to connected after a held call, and open it into a deal. Everything else, outreach,
            nurture, disqualification, is a human move. The forbidden move matters most: nothing ever goes backwards.
          </p>
          <WorkflowGraph
            graph={LEAD_STATES}
            caption="Green arrows are agent moves; dashed arrows are human-only. Cold inbound enters at new (with a 4-hour SLA) via the site's lead capture workflow; nurture and unqualified are reachable from any active state, always by a human."
          />
          <GraphLegend
            items={[
              { kind: 'write', label: 'agent may move' },
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
            An automation is defined by what happens off the happy path. Each row here is a real condition the agents
            hit, what they do about it, and where a human hears about it. Silence is only ever by design.
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
                    <td>{r.when}</td>
                    <td>{r.then}</td>
                    <td>{r.heard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Contract + timing + instrumentation */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            The contract
          </span>
          <h2 className="section-title section-title--sm">Data, timing, and how we know it works</h2>
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>Reads and writes</h3>
              <ul>
                <li>Reads: 14 days of calendar events; the day&rsquo;s recordings and transcripts; existing people and leads</li>
                <li>Writes: people, companies, leads, inquiries, meetings with transcripts, interactions, deals, lifecycle transitions, one mail draft per call</li>
                <li>Idempotency keys: the person&rsquo;s email, the calendar event id, the recording token</li>
                <li>Re-running any day is a no-op: every write checks its key first</li>
              </ul>
            </div>
            <div className="wf-info-card">
              <h3>Timing model</h3>
              <ul>
                <li>6am: before the first call of the day, so every caller is already a lead</li>
                <li>6pm: after the day&rsquo;s calls, before the evening review</li>
                <li>The 14-day horizon re-verifies future bookings daily, so reschedules and cancellations surface</li>
                <li>Transcripts lag calls by minutes; anything unfinished at 6pm is caught next run</li>
                <li>Runs live on a workstation schedule: a missed run executes at next wake, keys make that safe</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>How we know it works</h3>
              <ul>
                <li>Days with no external activity are silent, so every message means something</li>
                <li>Every DM lists what was skipped and why, so gaps are visible daily</li>
                <li>A day with calls but no evening DM is itself the alarm</li>
                <li>Weekly eyeball: leads without sources, deals without dated next steps. Zero of each is the target</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Anatomy + closing */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <p className="wf-lead u-mt-6">
            This workflow replaced our earlier Sales Call Intelligence pipeline: same philosophy, now running end to end
            on scheduled agents, and documented at the level a developer could rebuild it from. It feeds the same
            pipeline as{' '}
            <Link href="/workflows/lead-capture" className="u-accent">
              Lead Capture to CRM
            </Link>
            .
          </p>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
