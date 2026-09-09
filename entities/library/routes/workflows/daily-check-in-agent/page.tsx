import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, SevenElements, DetailFooter, type WorkflowElement } from '../ui'
import { WorkflowGraph, GraphLegend } from '../graph'
import { DAILY_AGENT, WEEKLY_SUMMARY, PERSON_DAY } from './graphs'

const title = 'Daily Check-in Agent | Edge8 Workflows'
const description =
  'One scheduled agent replaces the stand-up. Every weekday a 09:00 reminder tells both teams it is time to update their cards; at 09:30 the agent reads each person’s cards on the Workboard, writes a three-line check-in (done yesterday, doing today, blockers) for the Product Team and for EO, and posts it to the right Lark chat. Anyone whose cards have not moved in 24 hours is checked against days off, then nudged hourly; a late update lands as a reply in the morning post’s thread. Every Wednesday a weekly summary with the Human and AI token report closes the week.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/daily-check-in-agent/' },
  openGraph: { title, description, url: '/workflows/daily-check-in-agent/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'Time. 09:00 (+07) every weekday for the reminder, 09:30 for the check-in, 09:00 every Wednesday for the weekly summary. Nobody calls a meeting.' },
  { name: 'Inputs', assignment: 'machine', desc: 'The Workboard: each person’s cards, the moves logged against them, and the comments on them. Days off from the time-off table. Human Tokens from the tracker, AI tokens from the run log.' },
  { name: 'Decision', assignment: 'both', desc: 'The agent decides whether a person has been active in the window and whether silence is a day off. It never decides what someone did; it reads it off the cards.' },
  { name: 'Routing', assignment: 'machine', desc: 'Two rosters, two chats. Product Team check-ins land in Infinite Leverage, EO check-ins land in EO. A nudge goes to the person as a DM, never to the channel.' },
  { name: 'Output', assignment: 'machine', desc: 'One check-in message per team per weekday, one weekly summary per team on Wednesday, and a routine run row with the tokens it cost.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Lark messages in the team chat; hourly DMs to anyone stale; a late check-in as a reply in the morning post’s thread, with the post edited to match. The weekly summary is the first thing read at Wednesday planning.' },
  { name: 'Measurement', assignment: 'human', desc: 'A weekday with no post is the alarm. Every post names who was pinged and who was off, so the gaps are visible daily, not at the retro.' },
]

const EXCEPTIONS = [
  { when: 'No card moved or commented in 24 hours', then: 'Day off checked; if none, a DM every hour', heard: 'The DM; the post lists them as pending' },
  { when: 'Cards updated after the 09:30 post', then: 'Check-in posted as a reply in the morning post’s thread; the pending line is edited', heard: 'The thread, the same day' },
  { when: 'Day off booked', then: 'Listed as off, never pinged', heard: 'The team post, one line' },
  { when: 'Pinged all day, still nothing by 17:30', then: 'Pings stop; named as missing in the next post', heard: 'Tomorrow’s team post' },
  { when: 'Person has no cards on any board', then: 'Listed with “no cards”, no nudge', heard: 'The team post, for the lead to fix' },
  { when: 'Card moved by someone other than the assignee', then: 'Counts as activity; the mover is named', heard: 'The team post' },
  { when: 'Blocker written in a card comment', then: 'Surfaces under Blockers until the card moves', heard: 'Every post until it clears' },
  { when: 'Public holiday', then: 'Treated as a day off for the whole team, no run', heard: 'Nowhere, by design' },
  { when: 'Workboard read fails', then: 'Run aborts before any message or ping', heard: 'Run log; the missing post is the tell' },
  { when: 'Lark send fails', then: 'Summary printed to the run log, pings skipped', heard: 'Run log' },
  { when: 'No token data for a person that week', then: 'Shown as “no data”, never zero', heard: 'The weekly summary' },
  { when: 'Same team and day seen again', then: 'No-op by key, never a duplicate post', heard: 'Nowhere, by design' },
]

export default function DailyCheckInAgentWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Operations"
        title="Daily Check-in Agent"
        tldr="The stand-up is the meeting everyone attends and nobody needs, because the answers already live on the Workboard. This agent reads them off the cards every morning, posts a three-line check-in per team, and chases only the people whose cards went quiet. On Wednesday it closes the week with the outcomes and the Human and AI token report the planning session runs on."
        meta={[
          { label: 'Source', value: 'Workboard cards + comments' },
          { label: 'Cadence', value: 'Weekdays 09:00 and 09:30, Wednesdays 09:00' },
          { label: 'Human touchpoints', value: 'The card, the planning read' },
        ]}
      />

      {/* Orientation */}
      <section className="section u-pb-8">
        <div className="container">
          <span className="section-label">The shape, in ten seconds</span>
          <h2 className="section-title section-title--sm">Cards in, check-ins out</h2>
          <p className="section-sub u-mt-3">
            This rail is the orientation, not the workflow. Real life branches, loops, and fails; the diagrams below
            are the truth, drawn branch by branch.
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'Time to Check In', cadence: '09:00 weekdays', actor: 'system' },
              { num: '02', title: 'Cards Move', cadence: 'Thirty minutes, on the Workboard', actor: 'human', actorLabel: 'Team' },
              { num: '03', title: 'Check-ins Gathered', cadence: '09:30 weekdays', actor: 'ai', actorLabel: 'Claude' },
              { num: '04', title: 'Posted to the Chat', cadence: 'Infinite Leverage, EO', actor: 'system' },
              { num: '05', title: 'The Nudge', cadence: 'Hourly, late ones in the thread', actor: 'ai', actorLabel: 'Claude' },
              { num: '06', title: 'Week Closes', cadence: 'Tuesday night', actor: 'system' },
              { num: '07', title: 'Weekly Summary', cadence: 'Wednesday 09:00', actor: 'ai', actorLabel: 'Claude' },
              { num: '08', title: 'Planning', cadence: 'Wednesday', actor: 'human', actorLabel: 'Team leads' },
            ]}
          />
        </div>
      </section>

      {/* Daily agent, real flow */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">The reality &middot; every weekday</span>
          <h2 className="section-title section-title--sm">The morning check-in, every branch</h2>
          <p className="section-sub u-mt-3">
            Eight boxes in the rail; three decisions, one loop and two quiet endings in reality. The 09:00 message is
            the only warning anyone gets; thirty minutes later the agent reads the board as it stands. The check-in
            itself is the easy part: done yesterday is the Done lane, doing today is the Doing lane, blockers are the
            comments. The interesting work is the silence: telling a day off from a forgotten board, chasing only the
            latter, and putting a late update where the day&rsquo;s record already lives, in the morning post&rsquo;s
            thread, rather than as a second post.
          </p>
          <WorkflowGraph
            graph={DAILY_AGENT}
            caption="The 09:00 reminder and the 09:30 agent. The bold box on the right is a DM to one person, not the channel; the green loop looks again every hour and stops at 17:30. A late update takes the left fork: a thread reply and an edit, never a second post."
          />
          <GraphLegend
            items={[
              { kind: 'trigger', label: 'schedule fires' },
              { kind: 'decision', label: 'decision' },
              { kind: 'human', label: 'human touchpoint' },
              { kind: 'wait', label: 'wait an hour' },
              { kind: 'write', label: 'run log write' },
              { kind: 'flag', label: 'flag a human' },
              { kind: 'terminal', label: 'quiet end' },
            ]}
          />
        </div>
      </section>

      {/* Person-day state machine */}
      <section className="section">
        <div className="container">
          <span className="section-label">The state machine</span>
          <h2 className="section-title section-title--sm">What one person&rsquo;s day looks like to the agent</h2>
          <p className="section-sub u-mt-3">
            Underneath the morning run sits one entity with rules: a person on a given day. Everyone starts stale at
            09:30. A move or a comment in the window makes them fresh; a booked day off makes them off; anything else
            makes them pinged, hourly, until a card moves or the day ends. A person who turns fresh before 09:30 is in
            the post; one who turns fresh after it goes into the post&rsquo;s thread. Only the human move, updating a
            card, is dashed. The agent never marks anyone fresh on its own.
          </p>
          <WorkflowGraph
            graph={PERSON_DAY}
            caption="Green arrows are agent moves; the dashed arrow is the one thing only the person can do. Off and fresh-by-09:30 reach the post; fresh-after-09:30 reaches its thread; missed is named the next morning instead."
          />
          <GraphLegend
            items={[
              { kind: 'write', label: 'agent may move' },
              { kind: 'action', label: 'human only (dashed)' },
              { kind: 'terminal', label: 'quiet end' },
            ]}
          />
        </div>
      </section>

      {/* Weekly summary, real flow */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">The reality &middot; every Wednesday</span>
          <h2 className="section-title section-title--sm">The weekly summary, every branch</h2>
          <p className="section-sub u-mt-3">
            The week runs Wednesday to Tuesday because Wednesday is planning day: the summary lands an hour before the
            session and is read aloud in it. Three reads, one decision, one post. Human Tokens come from the tracker,
            per person; AI tokens come from the run log, per team; a person with no card activity all week is named,
            never averaged away.
          </p>
          <WorkflowGraph
            graph={WEEKLY_SUMMARY}
            caption="The Wednesday agent. The red box in the middle is not a failure: it is the summary naming a person for the team lead. The two red paths on the left are failures, and both end in the run log."
          />
          <GraphLegend
            items={[
              { kind: 'trigger', label: 'schedule fires' },
              { kind: 'decision', label: 'decision' },
              { kind: 'human', label: 'human touchpoint' },
              { kind: 'write', label: 'run log write' },
              { kind: 'flag', label: 'flag a human' },
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
            An automation is defined by what happens off the happy path. Each row here is a real condition the agent
            hits, what it does about it, and where a human hears about it. Silence is only ever by design.
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
          <span className="section-label wf-section--white">The contract</span>
          <h2 className="section-title section-title--sm">Data, timing, and how we know it works</h2>
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>Reads and writes</h3>
              <ul>
                <li>Reads: tasks, the stage log and the comments on them for the window; time off; the two team rosters and their chats; the Human Token Tracker; the routine run log for AI tokens</li>
                <li>Writes: one reminder and one check-in per team per weekday, at most one DM per stale person per hour, one thread reply and one post edit per late person, one weekly summary per team, one routine run row per run</li>
                <li>Idempotency keys: team plus date for the reminder and the post; person plus date plus hour for a ping; person plus date for the thread reply; team plus week for the summary</li>
                <li>Re-running any morning is a no-op: every message checks its key first</li>
              </ul>
            </div>
            <div className="wf-info-card">
              <h3>Timing model</h3>
              <ul>
                <li>09:00 (+07) weekdays: the reminder, thirty minutes before the board is read</li>
                <li>09:30 (+07) weekdays: the check-in, after the first coffee, before the first meeting</li>
                <li>The window is since the previous post, so a Monday reads back over the weekend</li>
                <li>Pings run 10:30 to 17:30; a late update is threaded the same hour; the last ping is the last one, and the miss is named next morning</li>
                <li>Wednesday 09:00: the summary lands an hour before planning, covering Wednesday to Tuesday</li>
                <li>Runs live on a workstation schedule: a missed run executes at next wake, keys make that safe</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>How we know it works</h3>
              <ul>
                <li>A weekday with no post in either chat is itself the alarm</li>
                <li>Every post lists who was off and who was pinged, so a quiet board is visible the same day</li>
                <li>The weekly token totals reconcile to the tracker; a gap means the tracker is behind, not the team</li>
                <li>Weekly eyeball: people pinged three days running, cards in Doing for over a week. Zero of each is the target</li>
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
            This is the same pattern as{' '}
            <Link href="/workflows/lark-scheduler-to-crm-updates" className="u-accent">
              Lark Scheduler to CRM Updates
            </Link>
            : a scheduled agent reading systems that already hold the truth, writing one message a human actually
            reads, and refusing to guess. The cards are the stand-up; the agent only reads them out.
          </p>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
