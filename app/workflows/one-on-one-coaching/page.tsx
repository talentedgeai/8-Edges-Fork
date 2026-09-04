import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const title = 'The Biweekly 1-1 Coaching Cycle | Edge8 Workflows'
const description =
  'Our 1-1 coaching system: AI preps every meeting, a human holds it, and AI drafts a two-tier recap that publishes only after the coach reviews it. Check-ins loop into the next prep, and monthly trends feed the coaching focus back in.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/one-on-one-coaching/' },
  openGraph: { title, description, url: '/workflows/one-on-one-coaching/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'machine', desc: 'The calendar. A daily 07:45 cron watches the biweekly anchor dates; prep, nudges, check-ins, and trends all key off it. Nothing waits on memory.' },
  { name: 'Inputs', assignment: 'both', desc: 'The person’s goals, priorities, KPIs, open commitments, OCEAN profile, and every prior 1-1, plus the transcript Lark Minutes hands over after the meeting.' },
  { name: 'Decision', assignment: 'human', desc: 'Everything that touches a person: the mode to coach in, what the recap says, when it publishes, what the profile claims. The AI proposes; the coach decides.' },
  { name: 'Routing', assignment: 'machine', desc: 'Prep to the coach, check-ins to the member, every nudge as a Lark DM with an email twin, and each tier of the recap to its own access layer, enforced in code.' },
  { name: 'Output', assignment: 'machine', desc: 'A prep doc per cycle, a two-tier recap, a living commitments log, and a monthly trend report per person.' },
  { name: 'Delivery', assignment: 'machine', desc: 'The team portal: a coaching dashboard on the coach’s side, a my-coaching view on the member’s side, and goals visible to the whole team.' },
  { name: 'Measurement', assignment: 'machine', desc: 'Mode split per 1-1 against the 80/15/5 target, commitment follow-through rate, and goal progress against the company ladder.' },
]

const PROBLEMS = [
  'Prep quality depends on the week. Busy weeks get winged 1-1s, and the person can always tell.',
  'Commitments made in the room evaporate by Friday, and nobody notices until the next meeting.',
  'Private coaching notes and shared feedback live in the same doc, so candor loses to caution.',
  'Managers default to telling. Without a scoreboard, nobody knows their coach-to-directive ratio.',
  'Retention risk shows up in the exit interview, months after it was readable in the room.',
]

// The real cycle, drawn with its loops and branches: the biweekly loop, the
// transcript fallback, the review-then-publish gate, the private layer that
// never opens, and monthly trends feeding back into the next prep.
function CoachingCycleFlowchart() {
  const ink = 'var(--color-primary-dark)'
  const sub = 'var(--color-grey-500)'
  const line = 'var(--color-grey-500)'
  const nodeStroke = 'var(--color-grey-200)'
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--color-bg-primary)', strokeWidth: 4 }
  return (
    <div style={{ overflowX: 'auto', margin: '40px 0 8px' }}>
      <svg
        viewBox="0 0 940 1060"
        role="img"
        aria-label="Biweekly coaching cycle flowchart: AI prep, the human 1-1, transcript auto-detection with a paste fallback, AI drafting both recap tiers, the coach review and publish gate, the shared recap, the mid-cycle check-in looping into the next prep, the private coach layer that never publishes, and monthly trend analysis feeding the next cycle"
        style={{ minWidth: 760, width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' }}
      >
        <defs>
          <marker id="carr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={line} />
          </marker>
        </defs>

        {/* ── The private coach layer ───────────────────────────────────── */}
        <rect x="686" y="120" width="224" height="560" rx="16" fill="var(--color-grey-50)" stroke={nodeStroke} />
        <text x="798" y="158" textAnchor="middle" fontSize="13.5" fontWeight="700" letterSpacing="1" fill={ink}>THE PRIVATE COACH LAYER</text>
        <text x="798" y="188" textAnchor="middle" fontSize="12.5" fill={sub}>Preps, transcripts, private</text>
        <text x="798" y="206" textAnchor="middle" fontSize="12.5" fill={sub}>summaries, mode splits,</text>
        <text x="798" y="224" textAnchor="middle" fontSize="12.5" fill={sub}>retention reads, trend reports.</text>
        <line x1="710" y1="250" x2="886" y2="250" stroke={nodeStroke} />
        <text x="710" y="280" fontSize="12.5" fontWeight="700" fill={ink}>Who sees it:</text>
        <text x="710" y="302" fontSize="12.5" fill={sub}>· the coach, and no one else</text>
        <text x="710" y="322" fontSize="12.5" fill={sub}>· not the member</text>
        <text x="710" y="342" fontSize="12.5" fill={sub}>· not the team</text>
        <text x="710" y="362" fontSize="12.5" fill={sub}>· not the AI assistants</text>
        <line x1="710" y1="390" x2="886" y2="390" stroke={nodeStroke} />
        <text x="710" y="420" fontSize="12.5" fontWeight="700" fill={ink}>The only door out:</text>
        <text x="710" y="442" fontSize="12.5" fill={sub}>the shared recap, and it opens</text>
        <text x="710" y="460" fontSize="12.5" fill={sub}>only when the coach publishes.</text>
        <text x="710" y="496" fontSize="12.5" fontWeight="700" fill={ink}>Separation is code:</text>
        <text x="710" y="518" fontSize="12.5" fill={sub}>the two tiers are separate</text>
        <text x="710" y="536" fontSize="12.5" fill={sub}>columns with separate query</text>
        <text x="710" y="554" fontSize="12.5" fill={sub}>scopes. Mixing them is a bug,</text>
        <text x="710" y="572" fontSize="12.5" fill={sub}>not a human slip.</text>

        {/* ── Spine ─────────────────────────────────────────────────────── */}
        {/* 1. AI prep */}
        <rect x="200" y="24" width="260" height="64" rx="12" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" />
        <text x="330" y="52" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>AI prep lands</text>
        <text x="330" y="72" textAnchor="middle" fontSize="12" fill={sub}>GROW openers · mode to use · retention check</text>
        <path d="M 330 88 L 330 124" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 2. The 1-1 */}
        <rect x="200" y="124" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="152" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>The 1-1 (human)</text>
        <text x="330" y="172" textAnchor="middle" fontSize="12" fill={sub}>mode chosen deliberately: coach · mentor · direct</text>
        <path d="M 330 188 L 330 224" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 3. Transcript */}
        <rect x="200" y="224" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="252" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Transcript arrives</text>
        <text x="330" y="272" textAnchor="middle" fontSize="12" fill={sub}>Lark Minutes, matched by date + participants</text>
        {/* fallback branch */}
        <rect x="30" y="228" width="140" height="56" rx="10" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="100" y="251" textAnchor="middle" fontSize="12.5" fontWeight="700" fill={ink}>No Minutes found</text>
        <text x="100" y="269" textAnchor="middle" fontSize="12" fill={sub}>paste a link or text</text>
        <path d="M 170 256 L 196 256" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#carr)" />
        <path d="M 330 288 L 330 324" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 4. AI drafts both tiers */}
        <rect x="200" y="324" width="260" height="76" rx="12" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" />
        <text x="330" y="350" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>AI drafts the recap, both tiers</text>
        <text x="330" y="370" textAnchor="middle" fontSize="12" fill={sub}>private summary · shared recap</text>
        <text x="330" y="388" textAnchor="middle" fontSize="12" fill={sub}>commitments · mode split estimate</text>
        <path d="M 460 362 L 682 362" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#carr)" />
        <text x="571" y="350" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>both tiers file here</text>
        <path d="M 330 400 L 330 436" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 5. Review gate */}
        <polygon points="330,436 470,516 330,596 190,516" fill="var(--color-bg-primary)" stroke="var(--color-grey-400)" />
        <text x="330" y="510" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>Coach reviews</text>
        <text x="330" y="530" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>both tiers</text>
        {/* edit loop */}
        <path d="M 190 516 L 120 516 L 120 362 L 196 362" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />
        <text x="128" y="498" fontSize="12.5" fill={sub} style={halo}>not right yet: edit</text>
        {/* private tier stays */}
        <path d="M 470 516 L 682 516" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#carr)" />
        <text x="576" y="504" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>private tier stays here</text>
        <text x="345" y="620" fontSize="12.5" fill={sub} style={halo}>coach hits publish</text>
        <path d="M 330 596 L 330 634" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 6. Shared recap publishes */}
        <rect x="200" y="634" width="260" height="64" rx="12" fill="var(--color-ok-bg)" stroke="var(--color-ok-bg)" />
        <text x="330" y="662" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Shared recap publishes</text>
        <text x="330" y="682" textAnchor="middle" fontSize="12" fill={sub}>member sees recap + commitments</text>
        <path d="M 330 698 L 330 734" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />

        {/* 7. Mid-cycle check-in */}
        <rect x="200" y="734" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="762" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Mid-cycle check-in</text>
        <text x="330" y="782" textAnchor="middle" fontSize="12" fill={sub}>off week · a nudge per open commitment</text>

        {/* the biweekly loop back to prep */}
        <path d="M 330 798 L 330 834 L 40 834 L 40 56 L 196 56" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#carr)" />
        <text x="52" y="822" fontSize="12.5" fill={sub} style={halo}>the loop: the next prep reads everything above</text>

        {/* Monthly trends */}
        <rect x="200" y="904" width="260" height="76" rx="12" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" />
        <text x="330" y="932" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Monthly trend analysis</text>
        <text x="330" y="952" textAnchor="middle" fontSize="12" fill={sub}>trajectory · themes · follow-through</text>
        <text x="330" y="968" textAnchor="middle" fontSize="12" fill={sub}>coaching opportunities · flags</text>
        <path d="M 798 680 L 798 942 L 466 942" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#carr)" />
        <text x="620" y="930" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>reads the full history</text>
        <path d="M 200 942 L 60 942 L 60 838" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#carr)" />
        <text x="70" y="930" fontSize="12.5" fill={sub} style={halo}>feeds the next cycle&apos;s focus</text>
      </svg>
    </div>
  )
}

export default function OneOnOneCoachingWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="The Biweekly 1-1 Coaching Cycle"
        tldr="Every team member gets a biweekly 1-1 that runs as a loop, not a line. AI preps the conversation, a human holds it, and AI drafts a two-tier recap that reaches the member only after the coach reviews and publishes it. A mid-cycle check-in on the off week feeds the next prep, and a monthly trend analysis feeds the coaching focus. The AI preps and drafts; the human decides."
        meta={[
          { label: 'Cadence', value: 'Biweekly' },
          { label: 'Human steps', value: '1 of 5' },
          { label: 'Mode target', value: '80/15/5' },
        ]}
      />

      {/* The problem */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">The problem</span>
          <h2 className="section-title section-title--sm">
            1-1s fail quietly, in five ways
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Most leaders do not skip 1-1s. They run them without a system, and the same five things slip:
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

      {/* The shape */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The shape
          </span>
          <h2 className="section-title section-title--sm">
            A loop with a gate, not a line
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            One person&apos;s two-week cycle. Solid lines are the working loop; dashed lines are the private layer&apos;s
            memory and the trend feedback. The recap has a review-then-publish branch, and nothing crosses from the
            private tier to the member without the coach opening the gate.
          </p>
          <CoachingCycleFlowchart />
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
                title: 'AI prep: tailored, days before',
                cadence: 'Friday before the 1-1',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    The cron kicks off a prep for each upcoming 1-1: GROW-structured openers led by the goal question,
                    a recommended mode for this conversation, one thing to listen for, a retention check, and one
                    question to avoid. It reads the person&apos;s goals, priorities, open commitments, OCEAN profile,
                    last check-in answers, and the latest trend report. The coach gets a Lark DM and an email with a
                    portal link, and skims it in two minutes.
                  </p>
                ),
              },
              {
                num: '02',
                title: 'The 1-1: the only human step, on purpose',
                cadence: 'Anchor day, every two weeks',
                actor: 'human',
                actorLabel: 'Coach',
                body: (
                  <>
                    <p>
                      The coach runs a GROW conversation with the mode chosen deliberately: coach (ask, and let them
                      find it), mentor (share the experience), or direct (tell, because the situation demands it). The
                      standing target is 80% coach, 15% mentor, 5% direct, and the system scores every meeting against
                      it, so drift toward telling shows up as a number, not a feeling.
                    </p>
                    <p>
                      The meeting records through Lark Minutes in the background. The coach&apos;s job in the room is
                      presence, not note-taking.
                    </p>
                  </>
                ),
              },
              {
                num: '03',
                title: 'The recap: two tiers, one gate',
                cadence: 'Right after, published when reviewed',
                actor: 'ai',
                actorLabel: 'Claude + coach',
                body: (
                  <>
                    <p>
                      The cron auto-detects the new Lark Minutes recording, matches it to the scheduled 1-1 by date and
                      participants, and pulls the transcript. If no Minutes exists, the coach pastes a link or raw text
                      on the log form. From the transcript, AI drafts both tiers: a private summary for the coach
                      (candid reads, retention signal, mode split estimate) and a shared recap for the member, plus the
                      commitments made by either side. Always commitments, never tasks: they were agreed in a
                      conversation, not assigned from above.
                    </p>
                    <p>
                      The coach reviews and edits both tiers. The shared recap reaches the member only when the coach
                      saves it. Until then it does not exist outside the private layer.
                    </p>
                  </>
                ),
              },
              {
                num: '04',
                title: 'The mid-cycle check-in, feeding the next prep',
                cadence: 'The off week',
                actor: 'system',
                body: (
                  <p>
                    Halfway through the cycle, the system sends the member a warm nudge on each open commitment, as a
                    Lark DM with an email twin, linking to the portal where they update status and add a note. Course
                    corrections happen in week one instead of surfacing as surprises in the next meeting, and every
                    answer lands in front of the AI when it writes the next prep. The check-in is not a status report
                    to a manager; it is the loop talking to itself.
                  </p>
                ),
              },
              {
                num: '05',
                title: 'Monthly trends, feeding the coaching focus',
                cadence: 'Monthly, per person',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    Once a month the system reads the full history and writes a private trend report: growth
                    trajectory, recurring themes, commitment follow-through, coaching opportunities, and flags worth
                    raising. Patterns no one catches meeting to meeting become the next cycle&apos;s coaching focus.
                    Every claim points to a behavior in the data; thin reads say low-confidence, and nothing is ever
                    fabricated to fill a gap.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* The scoreboard */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The scoreboard
          </span>
          <h2 className="section-title section-title--sm">
            Goals, priorities, KPIs, commitments
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Four concepts, four horizons, and they are never confused with each other:
          </p>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Concept</th>
                  <th>Horizon</th>
                  <th>What it is</th>
                  <th>Who sees it</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>FAST goals</td>
                  <td>Quarterly</td>
                  <td>
                    What the person is driving this quarter: Frequent, Ambitious, Specific, Transparent. One or more
                    per person, reviewed in every 1-1.
                  </td>
                  <td>The whole team. Transparent is the T.</td>
                </tr>
                <tr>
                  <td>Priorities</td>
                  <td>Week to week</td>
                  <td>
                    Standing focus items (P1, P2...) that open every 1-1. The working agenda between the goals and the
                    day-to-day.
                  </td>
                  <td>Coach + member</td>
                </tr>
                <tr>
                  <td>KPIs</td>
                  <td>Continuous</td>
                  <td>
                    Numbers the person owns, with a target, a direction, and readings over time. A goal linked to one
                    shows live progress automatically.
                  </td>
                  <td>Coach + member</td>
                </tr>
                <tr>
                  <td>Commitments</td>
                  <td>Cycle to cycle</td>
                  <td>
                    What was agreed in the 1-1, who owns it, by when. The member updates status and notes. Never called
                    tasks.
                  </td>
                  <td>Coach + member</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="wf-info-grid" style={{ marginTop: 32 }}>
            <div className="wf-info-card">
              <h3>Goals ladder up ⇅ progress flows down</h3>
              <ul>
                <li>Every FAST goal can ladder into the company goal tree at whichever altitude fits: an objective, a
                  key result, or a KPI metric</li>
                <li>Coaching that moves a personal goal moves a company KR, visibly</li>
                <li>A metric-linked goal shows its live readings inside the 1-1 view</li>
                <li>The company-level goal health chips read the coaching goals directly, so &quot;everyone has a
                  current goal&quot; is measured, not asserted</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why the distinction matters</h3>
              <ul>
                <li>Goals are quarterly and public, so ambition is visible and peer-supported</li>
                <li>Priorities keep the 1-1 anchored without turning goals into a weekly status check</li>
                <li>KPIs stop progress debates: the number is on the screen</li>
                <li>Commitments make follow-through measurable without anyone playing task cop</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The person model */}
      <section className="section">
        <div className="container">
          <span className="section-label">The person model</span>
          <h2 className="section-title section-title--sm">
            What the coach knows, and who gets to see it
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Two standing reads per person keep the coaching grounded, and both live behind explicit rules:
          </p>
          <div className="wf-info-grid" style={{ marginTop: 32 }}>
            <div className="wf-info-card">
              <h3>The OCEAN profile</h3>
              <ul>
                <li>Five personality dimensions, each with a rating and behavioral evidence, plus a snapshot and growth
                  guidance</li>
                <li>Coach-authored, never AI-published: the coach reviews before any profile goes live</li>
                <li>The member sees their own full profile once published, rewritten in second person so it reads as
                  growth coaching, not a verdict</li>
                <li>Nobody else sees it: not the team, not the assistants</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>The retention read</h3>
              <ul>
                <li>Built on job embeddedness: the three roots that keep people are belonging and fit, links to the
                  people around them, and what they would sacrifice by leaving</li>
                <li>The AI names the thinnest root early, while it is still coachable</li>
                <li>Private to the coach, always: a retention read is a signal to act on, never a label on a person</li>
                <li>Most companies learn these answers in the exit interview, when they can no longer help</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            Two tiers, never mixed
          </span>
          <h2 className="section-title section-title--sm">
            Privacy by access control, not discipline
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            The private coach layer and the person-facing layer are separate columns with separate query scopes.
            Mixing them is a code bug, not a human slip. The full access matrix:
          </p>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Coach</th>
                  <th>Member</th>
                  <th>Whole team</th>
                  <th>AI assistants</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>FAST goals</td>
                  <td>Read + write</td>
                  <td>Read</td>
                  <td>Read</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>Priorities + KPIs</td>
                  <td>Read + write</td>
                  <td>Read</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>OCEAN profile</td>
                  <td>Read + write</td>
                  <td>Read, own only, once published</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>Commitments</td>
                  <td>Read + write</td>
                  <td>Updates status + notes</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>Shared recaps + check-ins</td>
                  <td>Read + write</td>
                  <td>Read</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>Prep, transcript, private summary, mode split</td>
                  <td>Read + write</td>
                  <td>No access</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
                <tr>
                  <td>Retention read + trend reports</td>
                  <td>Read + write</td>
                  <td>No access</td>
                  <td>No access</td>
                  <td>No access</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="section-sub" style={{ marginTop: 24 }}>
            The assistant lockout is total: none of the coaching tables are readable by the company&apos;s internal AI
            assistants, the same treatment as sensitive HR data. Private coaching data never transits an assistant.
          </p>
        </div>
      </section>

      {/* Tooling */}
      <section className="section">
        <div className="container">
          <span className="section-label">The tooling</span>
          <h2 className="section-title section-title--sm">
            What runs it
          </h2>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Role in the cycle</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Daily cron, 07:45</td>
                  <td>
                    The clock behind everything: prep nudges, overdue-1-1 flags, mid-cycle check-ins, monthly trends,
                    and Minutes auto-detection, all from one daily run.
                  </td>
                </tr>
                <tr>
                  <td>Lark DMs + email</td>
                  <td>
                    Every nudge goes out twice: a Lark DM and an email twin, so nothing is missed. Links always land on
                    the portal, where the data lives.
                  </td>
                </tr>
                <tr>
                  <td>Lark Minutes</td>
                  <td>
                    The transcript source. New recordings are auto-detected and matched to scheduled 1-1s by date and
                    participants; the fallback is pasting a link or raw text.
                  </td>
                </tr>
                <tr>
                  <td>Claude</td>
                  <td>
                    Prep, recap drafting, and trend analysis. Every call fails soft: an AI error lands on the record
                    and never blocks the meeting from happening.
                  </td>
                </tr>
                <tr>
                  <td>The team portal</td>
                  <td>
                    The interface for both tiers: a coaching dashboard for the coach, a my-coaching view for the
                    member, goals visible on team profiles.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* The guardrail */}
      <section className="section" style={{ background: 'var(--dark)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'color-mix(in srgb, var(--color-bg-primary) 10%, transparent)', color: 'color-mix(in srgb, var(--color-bg-primary) 80%, transparent)' }}>
            The guardrail
          </span>
          <h2 className="section-title" style={{ fontSize: 32, color: 'var(--white)' }}>
            The AI preps and drafts. The human decides.
          </h2>
          <p className="wf-hero-sub" style={{ marginTop: 12 }}>
            The rule that sits above every step: the AI never recommends promoting, managing out, ranking, or labeling
            a person. It surfaces the signal and proposes the move; the coach coaches the team. No permanent people
            decision is made during an emotional spike, and every claim the AI makes points to a behavior in the data.
          </p>
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
                <li>The 1-1 itself is the only human step, and it is the one that matters</li>
                <li>Nothing reaches the member without the coach reviewing and publishing it</li>
                <li>The two tiers never mix; the separation is enforced in code</li>
                <li>Commitments are agreed, never assigned, and never called tasks</li>
                <li>Thin reads say low-confidence; the AI never invents facts about people</li>
                <li>The coaching relationship is explicit and independent of the org chart, so any coach can run the
                  same system</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>Every 1-1 gets the same depth of prep, on the busiest week and the quietest</li>
                <li>The check-in loop means nothing waits two weeks to surface</li>
                <li>The mode split turns &quot;am I coaching or telling?&quot; into a trendable number</li>
                <li>Transparent goals make ambition public and progress peer-visible</li>
                <li>Retention risk is named while it is still a coaching topic, not a resignation letter</li>
                <li>Roughly an hour of prep and recap per person per cycle comes back to the coach</li>
              </ul>
            </div>
          </div>
          <p className="section-sub" style={{ marginTop: 40 }}>
            This cycle is the operational half of a larger build. The program plan behind it, from problem statement
            to deployment, is published as{' '}
            <Link href="/workflows/leadership-coach-program">The Leadership Coach: AI Program Plan</Link>.
          </p>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
