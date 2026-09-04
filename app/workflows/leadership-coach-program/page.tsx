import type { Metadata } from 'next'
import Link from 'next/link'
import { WorkflowHero, FlowRail, DetailFooter } from '../ui'

const title = 'The Leadership Coach: AI Program Plan | Edge8 Workflows'
const description =
  'The 5D program plan behind our 1-1 coaching system: the problem, the data, the workflow design, the ROI, and the deployment, with two-tier privacy enforced in code instead of discipline.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/leadership-coach-program/' },
  openGraph: { title, description, url: '/workflows/leadership-coach-program/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function LeadershipCoachProgramPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="The Leadership Coach: AI Program Plan"
        tldr="This is the actual program plan behind our 1-1 coaching system, published. It was written on the 5D framework we teach (Define, Discover, Design, Determine, Deploy), and it took the system from a proven prototype to production inside our company OS: the database is the system of record, the team portal is the interface, and the privacy model is enforced by code instead of discipline."
        meta={[
          { label: 'Framework', value: '5D program brief' },
          { label: 'Status', value: 'In production' },
          { label: 'System of record', value: 'Company OS' },
        ]}
      />

      {/* The guardrail */}
      <section className="section wf-section--dark-sm">
        <div className="container">
          <span className="section-label wf-chip--on-dark">
            The rule above the whole plan
          </span>
          <h2 className="section-title wf-title-xl">
            The coach preps and drafts. The human decides.
          </h2>
          <p className="wf-hero-sub u-mt-3">
            The AI never tells the coach to promote, manage out, rank, or label a person. It surfaces the signal and
            proposes the move. The human coaches the team. Every other design decision in this plan sits under that
            one.
          </p>
        </div>
      </section>

      {/* 1D Define */}
      <section className="section">
        <div className="container">
          <span className="section-label">1D · Define</span>
          <h2 className="section-title section-title--sm">
            Define the problem
          </h2>
          <p className="section-sub u-mt-3">
            The original problem: a leader&apos;s 1-1s are only as good as their prep and their memory. The first
            version proved the workflow (AI preps every biweekly 1-1, logs every commitment, reads retention risk, and
            holds the coach to coaching instead of telling). Moving it into the company OS solved two problems the
            prototype could not:
          </p>
          <div className="wf-info-grid u-mt-6">
            <div className="wf-info-card">
              <h3>Privacy by access control, not discipline</h3>
              <ul>
                <li>In the prototype, who saw a private coaching read versus a shared recap was a matter of care</li>
                <li>In the company OS, the private coach layer and the person-facing layer are separate columns with
                  separate query scopes</li>
                <li>Mixing them is a code bug, not a human slip</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>A system any coach can run</h3>
              <ul>
                <li>The coaching relationship is explicit in the data model, independent of the reporting line, with
                  dotted lines supported</li>
                <li>Today&apos;s roster belongs to one coach; the model already works for the next coach and their
                  team</li>
                <li>The next coach inherits the whole system for free</li>
              </ul>
            </div>
          </div>
          <p className="section-sub u-mt-6">
            Success looks like: every team member has current FAST goals laddered to a company objective or KPI; every
            1-1 is prepped, held, and logged in the portal; retention risk is named early; the coach&apos;s
            coach / mentor / direct split moves toward 80/15/5; and the prototype tooling is fully retired.
          </p>
        </div>
      </section>

      {/* 2D Discover */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            2D · Discover
          </span>
          <h2 className="section-title section-title--sm">
            Discover the data
          </h2>
          <p className="section-sub u-mt-3">
            Everything the coach reads lives in the company OS. The coach never invents facts about people: thin reads
            are marked low-confidence, and an unset goal says so.
          </p>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Where it lives</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Foundation docs</td>
                  <td>
                    The coach&apos;s leadership brand, EQ guide, communication style, operating system, and company
                    context, stored as coaching context the AI reads on every run.
                  </td>
                </tr>
                <tr>
                  <td>Company goal tree</td>
                  <td>Objectives, key results, and metrics: the ladder every FAST goal can attach to.</td>
                </tr>
                <tr>
                  <td>OCEAN profiles</td>
                  <td>A structured table: five dimensions with evidence, a snapshot, and growth guidance per person.</td>
                </tr>
                <tr>
                  <td>FAST goals, priorities, KPIs</td>
                  <td>
                    Dedicated goals and priorities tables per person; KPIs are metric rows owned by the person, with
                    targets and readings over time.
                  </td>
                </tr>
                <tr>
                  <td>1-1 history</td>
                  <td>Every prep, transcript, private summary, and shared recap, one row per meeting.</td>
                </tr>
                <tr>
                  <td>Commitments log</td>
                  <td>What was agreed in each 1-1, who owns it, by when, and its current status.</td>
                </tr>
                <tr>
                  <td>Retention read</td>
                  <td>The loosest embeddedness root per person (fit, links, or sacrifice), on the coaching profile.</td>
                </tr>
                <tr>
                  <td>Transcripts</td>
                  <td>
                    Lark Minutes, auto-detected: a daily cron matches new recordings to scheduled 1-1s by date and
                    participants. Fallback: paste a link or raw text.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3D Design */}
      <section className="section">
        <div className="container">
          <span className="section-label">3D · Design</span>
          <h2 className="section-title section-title--sm">
            Design the workflow
          </h2>
          <p className="section-sub u-mt-3">
            The concept model first: four things that are never confused with each other.
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
                  <td>Quarter</td>
                  <td>
                    What the person is driving this quarter: Frequent, Ambitious, Specific, Transparent. One or more
                    per person, each optionally laddering to an objective, a key result, or a KPI metric, at whichever
                    altitude fits.
                  </td>
                  <td>The whole team. Transparent is the T in FAST.</td>
                </tr>
                <tr>
                  <td>Priorities</td>
                  <td>Week to week</td>
                  <td>Standing focus items reviewed in every 1-1: the working agenda between goals and the day-to-day.</td>
                  <td>Coach + member</td>
                </tr>
                <tr>
                  <td>KPIs</td>
                  <td>Continuous</td>
                  <td>
                    Numbers the person owns, as metric rows with a target, a direction, and readings, so a linked goal
                    shows live progress automatically.
                  </td>
                  <td>Coach + member</td>
                </tr>
                <tr>
                  <td>Commitments</td>
                  <td>Cycle to cycle</td>
                  <td>What was agreed in the 1-1, who owns it, by when. Always commitments, never tasks.</td>
                  <td>Coach + member; the member updates status and notes</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="wf-info-grid u-mt-7">
            <div className="wf-info-card">
              <h3>The OCEAN profile</h3>
              <ul>
                <li>Structured: five dimensions, each with a rating and behavioral evidence, plus a personality
                  snapshot and growth guidance</li>
                <li>Coach-authored, member-readable: each person sees their own full profile, rewritten in second
                  person so it reads as growth coaching</li>
                <li>Reviewed by the coach before any profile goes member-visible</li>
                <li>A standing 1-1 topic, not a comment thread</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Two audiences, never mixed</h3>
              <ul>
                <li>Private coach layer: the roster dashboard (last and next 1-1, mode split, top priority, retention
                  root, attention flags), plus preps, transcripts, private summaries, and trend reports</li>
                <li>Person-facing layer: their goals, priorities, KPIs, and OCEAN profile, their open commitments, and
                  their shared recap history</li>
                <li>The internal AI assistants read neither: coaching data never transits an assistant</li>
              </ul>
            </div>
          </div>

          <h3 className="wf-lead--lg u-m-0 u-mt-8">The biweekly cycle</h3>
          <p className="section-sub u-mt-3">
            The heart of the design is a two-week loop with one human step:
          </p>
          <FlowRail
            steps={[
              { num: '01', title: 'AI Prep', cadence: 'Days before', actor: 'ai' },
              { num: '02', title: 'The 1-1', cadence: 'Anchor day', actor: 'human', actorLabel: 'Coach' },
              { num: '03', title: 'Two-Tier Recap', cadence: 'Right after', actor: 'ai', actorLabel: 'AI + review' },
              { num: '04', title: 'Mid-Cycle Check-in', cadence: 'Off week', actor: 'system' },
              { num: '05', title: 'Trend Analysis', cadence: 'Monthly', actor: 'ai' },
            ]}
            repeatNote="The loop repeats every two weeks, and it is not a straight line: the recap has a review-then-publish gate, check-ins feed the next prep, and trends feed the coaching focus."
          />
          <p className="section-sub u-mt-5">
            The full operational document, loops and branches included, is published as its own workflow:{' '}
            <Link href="/workflows/one-on-one-coaching">The Biweekly 1-1 Coaching Cycle</Link>.
          </p>
        </div>
      </section>

      {/* 4D Determine */}
      <section className="section wf-section--tint">
        <div className="container">
          <span className="section-label wf-section--white">
            4D · Determine
          </span>
          <h2 className="section-title section-title--sm">
            Determine the ROI
          </h2>
          <div className="wf-info-grid u-mt-6">
            <div className="wf-info-card">
              <h3>What the program returns</h3>
              <ul>
                <li>Leverage: roughly an hour of prep and recap per person per cycle handed back to the coach, on the
                  order of 130 hours a year for a small team, against a small per-cycle token cost</li>
                <li>Retention: the coach reads the three embeddedness roots (fit, links, sacrifice) and names the
                  thinnest one early; keeping one senior person who would otherwise drift out pays for the build many
                  times over</li>
                <li>Development that ladders: coaching that moves FAST goals visibly moves company key results</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>What the move to production added</h3>
              <ul>
                <li>The coach&apos;s own growth, measured: the coach / mentor / direct split is logged per 1-1 and
                  trendable in SQL, moving toward the 80/15/5 target</li>
                <li>Zero laptop dependency: the cron runs in the cloud whether or not anyone&apos;s machine is open</li>
                <li>Enforced privacy instead of careful privacy</li>
                <li>A coaching system the next coach inherits for free</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5D Deploy */}
      <section className="section">
        <div className="container">
          <span className="section-label">5D · Deploy</span>
          <h2 className="section-title section-title--sm">
            Deploy to production
          </h2>
          <p className="section-sub u-mt-3">
            The runtime: the company OS database as the system of record, the team portal as the interface (a coaching
            dashboard for the coach, a my-coaching view for each member, goals transparent on team profiles), a daily
            07:45 cron as the scheduler, and Claude for prep, recaps, and trends, with every call failing soft so an
            AI error never blocks a meeting.
          </p>
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Role in the system</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Lark, messaging</td>
                  <td>
                    All nudges go out as Lark DMs: prep-ready to the coach, mid-cycle check-ins to the member,
                    overdue-1-1 flags. Every message has an email twin so nothing is missed, and every link lands on
                    the portal.
                  </td>
                </tr>
                <tr>
                  <td>Lark Minutes</td>
                  <td>
                    The transcript source. The cron auto-detects new recordings, matches them to scheduled 1-1s by
                    date and participants, pulls the transcript, and drafts the recap for review.
                  </td>
                </tr>
                <tr>
                  <td>Transactional email</td>
                  <td>The email twin of every Lark nudge, through the company&apos;s existing sender.</td>
                </tr>
                <tr>
                  <td>The company goal tree</td>
                  <td>
                    A coaching goal&apos;s ladder is a real foreign key to an objective, key result, or metric, so
                    &quot;100% of the team has a current FAST goal&quot; is measured by the system existing, not
                    asserted in a slide.
                  </td>
                </tr>
                <tr>
                  <td>Claude</td>
                  <td>Prep, recap, and trends, on the top model tier: coaching nuance justifies it.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="wf-info-grid u-mt-7">
            <div className="wf-info-card">
              <h3>Guardrails, always on</h3>
              <ul>
                <li>The coach preps and drafts; the human decides. Never a promote, manage-out, rank, or label
                  recommendation</li>
                <li>Private and person-facing never mix; the shared recap publishes only after review</li>
                <li>No permanent people decisions during an emotional spike</li>
                <li>Every claim points to a behavior in the data; thin reads say low-confidence; nothing is fabricated</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Migration and retirement</h3>
              <ul>
                <li>The prototype&apos;s history imported in full: sessions, recaps, commitments, profiles</li>
                <li>Departed and role-changed people deactivated with history retained, never deleted</li>
                <li>The laptop-bound scheduled routines killed; the cloud cron replaces them</li>
                <li>The prototype workspace archived as system of record; the messaging tool stays for DMs and
                  transcripts only</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
