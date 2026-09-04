import type { Metadata } from 'next'
import { WorkflowHero, FlowRail, StepCards, SevenElements, DetailFooter, type WorkflowElement } from '../ui'

const ELEMENTS: WorkflowElement[] = [
  { name: 'Trigger', assignment: 'both', desc: 'No single trigger. A role opening, a strong inbound resume, a referral, or someone resurfacing from the pool can each start things off, and usually several are running at once.' },
  { name: 'Inputs', assignment: 'both', desc: 'The job description and screening questions, resumes from every channel (careers page, LinkedIn, referrals, agencies, batch drops), and the full history of everyone the company has already met.' },
  { name: 'Decision', assignment: 'both', desc: 'Every candidate gets two reads at the resume: the AI screen and the recruiter’s rating. The AI then joins every interview too, scoring on its own before it sees what the people said. People make every call to advance, reject, or send someone back.' },
  { name: 'Routing', assignment: 'both', desc: 'Not forward-only. Candidates move back a stage for another round, return to the shortlist after a declined offer, or leave to the pool and come back months later on a different role.' },
  { name: 'Output', assignment: 'machine', desc: 'A living record for each candidate: every application, every screen, both ratings, the notes, every interview scorecard, and every status change with its reason.' },
  { name: 'Delivery', assignment: 'machine', desc: 'Ranked, sortable views wherever the work happens: by role, by role family, and across the whole pool.' },
  { name: 'Measurement', assignment: 'machine', desc: 'How many make it through each loop, how often the AI and the recruiter disagree, the time from opening a role to hiring, and how often the pool, not a job board, fills the role.' },
]

const title = 'Recruitment: Three Loops, One Pool | Edge8 Workflows'
const description =
  'Our recruitment process is not a pipeline. Three loops run continuously (demand, sourcing, selection) around one candidate pool that never forgets. Backward moves are normal, and every exit is a pool entry.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/recruitment/' },
  openGraph: { title, description, url: '/workflows/recruitment/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const PROBLEMS = [
  'Hiring is written up as a straight line: post, screen, interview, offer. It never runs that way, so the diagram and real life drift apart until the diagram is fiction.',
  'Resumes come in by email, LinkedIn, referral, and agency, and half never get a reply. No one can say where a candidate stands without asking whoever holds the folder.',
  'How well a resume gets read depends on who reads the pile, and when. The 200th resume never gets the read the 5th did.',
  'A declined offer, a paused role, or a near-miss candidate has nowhere to go in a straight-line process, so all the work that went into them is just lost.',
]

const loopCard: React.CSSProperties = {
  background: 'var(--white)',
  border: '1px solid color-mix(in srgb, var(--color-primary-dark) 10%, transparent)',
  borderRadius: 14,
  padding: '20px 22px',
}

// The real selection flowchart: decision diamonds, labeled branches, backward
// loops, and the pool as an explicit destination on the right. Hand-drawn SVG
// so every condition is visible; horizontal scroll on small screens.
function SelectionFlowchart() {
  const ink = 'var(--color-primary-dark)'
  const sub = 'var(--color-grey-500)'
  const line = 'var(--color-grey-500)'
  const nodeStroke = 'var(--color-grey-200)'
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--color-bg-primary)', strokeWidth: 4 }
  return (
    <div style={{ overflowX: 'auto', margin: '40px 0 8px' }}>
      <svg
        viewBox="0 0 940 1400"
        role="img"
        aria-label="Selection flowchart: application to AI screen, two gates, screening call, interview rounds, offer, hire, with every no branch and every exit landing in the candidate pool"
        style={{ minWidth: 760, width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' }}
      >
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={line} />
          </marker>
        </defs>

        {/* ── The pool lane ─────────────────────────────────────────────── */}
        <rect x="686" y="224" width="224" height="1024" rx="16" fill="var(--color-grey-50)" stroke={nodeStroke} />
        <text x="798" y="262" textAnchor="middle" fontSize="13.5" fontWeight="700" letterSpacing="1" fill={ink}>THE CANDIDATE POOL</text>
        <text x="798" y="292" textAnchor="middle" fontSize="12.5" fill={sub}>Everyone we have ever met,</text>
        <text x="798" y="310" textAnchor="middle" fontSize="12.5" fill={sub}>ranked by best AI screen,</text>
        <text x="798" y="328" textAnchor="middle" fontSize="12.5" fill={sub}>grouped by role family.</text>
        <line x1="710" y1="352" x2="886" y2="352" stroke={nodeStroke} />
        <text x="710" y="380" fontSize="12.5" fontWeight="700" fill={ink}>Ways in:</text>
        <text x="710" y="402" fontSize="12.5" fill={sub}>· rejected, with reason</text>
        <text x="710" y="422" fontSize="12.5" fill={sub}>· withdrew</text>
        <text x="710" y="442" fontSize="12.5" fill={sub}>· future consideration</text>
        <text x="710" y="462" fontSize="12.5" fill={sub}>· on hold: role paused</text>
        <text x="710" y="482" fontSize="12.5" fill={sub}>· role closed: everyone in flight</text>
        <text x="710" y="502" fontSize="12.5" fill={sub}>· hired: still on the record</text>
        <line x1="710" y1="528" x2="886" y2="528" stroke={nodeStroke} />
        <text x="710" y="556" fontSize="12.5" fontWeight="700" fill={ink}>Way out:</text>
        <text x="710" y="578" fontSize="12.5" fill={sub}>brought back for the next role.</text>
        <text x="710" y="596" fontSize="12.5" fill={sub}>The pool is the first sourcing</text>
        <text x="710" y="614" fontSize="12.5" fill={sub}>channel every time a role opens.</text>

        {/* Pool resurfaces into the top of the funnel */}
        <path d="M 910 736 L 934 736 L 934 56 L 466 56" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#arr)" />
        <text x="700" y="44" fontSize="12.5" fill={sub} style={halo}>brought back for the next role</text>

        {/* ── Spine ─────────────────────────────────────────────────────── */}
        {/* Entry */}
        <rect x="200" y="24" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="52" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Application lands</text>
        <text x="330" y="72" textAnchor="middle" fontSize="12" fill={sub}>careers · batch drop · agency · referral</text>
        <path d="M 330 88 L 330 124" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* AI screen */}
        <rect x="200" y="124" width="260" height="64" rx="12" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" />
        <text x="330" y="152" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>AI screen (Claude)</text>
        <text x="330" y="172" textAnchor="middle" fontSize="12" fill={sub}>0–5 rating · reasoning · strengths · gaps</text>
        <path d="M 330 188 L 330 224" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* D1: two gates */}
        <polygon points="330,224 470,304 330,384 190,304" fill="var(--color-bg-primary)" stroke="var(--color-grey-400)" />
        <text x="330" y="298" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>Two gates</text>
        <text x="330" y="318" textAnchor="middle" fontSize="12" fill={sub}>AI score × recruiter</text>
        <path d="M 470 304 L 682 304" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="576" y="292" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>both weak: rejected</text>
        <text x="345" y="406" fontSize="12.5" fill={sub} style={halo}>strong on both</text>
        <path d="M 330 384 L 330 424" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* Gates disagree: second human look */}
        <path d="M 190 304 L 164 304" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <rect x="30" y="276" width="130" height="56" rx="10" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="95" y="299" textAnchor="middle" fontSize="12.5" fontWeight="700" fill={ink}>Gates disagree</text>
        <text x="95" y="317" textAnchor="middle" fontSize="12" fill={sub}>second human look</text>
        <path d="M 95 332 L 95 456 L 196 456" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="102" y="442" fontSize="12" fill={sub} style={halo}>worth a call</text>

        {/* Screening call */}
        <rect x="200" y="424" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="452" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Screening call</text>
        <text x="330" y="472" textAnchor="middle" fontSize="12" fill={sub}>recruiter: motivation · salary · notice</text>
        <path d="M 330 488 L 330 524" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* D2: right role, right now */}
        <polygon points="330,524 470,604 330,684 190,604" fill="var(--color-bg-primary)" stroke="var(--color-grey-400)" />
        <text x="330" y="598" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>Right role,</text>
        <text x="330" y="618" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>right now?</text>
        <path d="M 470 604 L 682 604" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="576" y="592" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>no: parked or withdrew</text>
        <text x="345" y="710" fontSize="12.5" fill={sub} style={halo}>yes</text>
        <path d="M 330 684 L 330 724" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* Interview rounds */}
        <rect x="200" y="724" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="752" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Interview rounds</text>
        <text x="330" y="772" textAnchor="middle" fontSize="12" fill={sub}>hiring team + AI panelist · as many as it takes</text>
        <path d="M 330 788 L 330 824" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* D3: panel decision */}
        <polygon points="330,824 470,904 330,984 190,904" fill="var(--color-bg-primary)" stroke="var(--color-grey-400)" />
        <text x="330" y="898" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>Panel</text>
        <text x="330" y="918" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>decision</text>
        <path d="M 470 904 L 682 904" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="576" y="892" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>no: rejected, with reason</text>
        <path d="M 190 904 L 120 904 L 120 756 L 196 756" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="130" y="884" fontSize="12.5" fill={sub} style={halo}>split: another round</text>
        <text x="345" y="1010" fontSize="12.5" fill={sub} style={halo}>yes</text>
        <path d="M 330 984 L 330 1024" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* Offer */}
        <rect x="200" y="1024" width="260" height="64" rx="12" fill="var(--color-bg-primary)" stroke={nodeStroke} />
        <text x="330" y="1052" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Offer + negotiation ⟲</text>
        <text x="330" y="1072" textAnchor="middle" fontSize="12" fill={sub}>terms move both ways</text>
        <path d="M 330 1088 L 330 1124" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* D4: accepted? */}
        <polygon points="330,1124 470,1204 330,1284 190,1204" fill="var(--color-bg-primary)" stroke="var(--color-grey-400)" />
        <text x="330" y="1210" textAnchor="middle" fontSize="14" fontWeight="700" fill={ink}>Accepted?</text>
        {/* declined: back to the warm shortlist (rejoins the spine above interviews) */}
        <path d="M 190 1204 L 60 1204 L 60 706 L 322 706" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />
        <text x="66" y="694" fontSize="12.5" fill={sub} style={halo}>declined: back to the warm shortlist</text>
        <text x="345" y="1308" fontSize="12.5" fill={sub} style={halo}>accepted</text>
        <path d="M 330 1284 L 330 1320" fill="none" stroke={line} strokeWidth="1.6" markerEnd="url(#arr)" />

        {/* Hired */}
        <rect x="200" y="1320" width="260" height="64" rx="12" fill="var(--color-ok-bg)" stroke="var(--color-ok-bg)" />
        <text x="330" y="1348" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink}>Hired</text>
        <text x="330" y="1368" textAnchor="middle" fontSize="12" fill={sub}>hands off to New Member Onboarding</text>
        <path d="M 460 1352 L 795 1352 L 795 1252" fill="none" stroke={line} strokeWidth="1.6" strokeDasharray="5 5" markerEnd="url(#arr)" />
        <text x="590" y="1340" textAnchor="middle" fontSize="12.5" fill={sub} style={halo}>still on the record</text>
      </svg>
    </div>
  )
}

export default function RecruitmentWorkflowPage() {
  return (
    <main>
      <WorkflowHero
        category="Talent"
        title="Recruitment: Three Loops, One Pool"
        tldr="Hiring is not a straight pipeline, because real hiring never is. Three loops run all the time: demand (roles open, pause, reopen, and close), sourcing (always on, across every channel), and selection (screen, interview as many rounds as it takes, then offer). All three feed one candidate pool that never forgets anyone. People move backward as often as forward, and every way out of a loop is a way into the pool."
        meta={[
          { label: 'Shape', value: '3 loops, 1 pool' },
          { label: 'Sourcing', value: 'Always on' },
          { label: 'AI reads', value: '100% of resumes' },
          { label: 'AI panelist', value: 'Every round' },
        ]}
      />

      {/* The problem */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container">
          <span className="section-label">The problem</span>
          <h2 className="section-title section-title--sm">
            Hiring is drawn as a line and lived as a loop
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Most hiring processes fail in the gap between the tidy diagram and the messy reality:
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
            Three loops orbiting one pool
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            Each loop runs on its own clock. None of them waits for the others, and all of them read from and write to
            the same candidate pool.
          </p>

          <div style={{ maxWidth: 900, margin: '40px auto 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div style={loopCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⟳ Demand loop</div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  Roles open, pause, reopen, change shape mid-search, and close. Closing a role never throws away its
                  candidates.
                </div>
              </div>
              <div style={loopCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⟳ Sourcing loop</div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  Always on: inbound, LinkedIn, referrals, agencies, batch drops, and resurfacing people we already
                  know.
                </div>
              </div>
              <div style={loopCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⟳ Selection loop</div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  AI screen, screening call, as many interview rounds as the role needs, then offer. Moving backward
                  is normal.
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 22, padding: '10px 0', opacity: 0.6 }}>⇅ ⇅ ⇅</div>
            <div style={{ ...loopCard, textAlign: 'center', borderWidth: 2 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>The Candidate Pool</div>
              <div style={{ fontSize: 14, opacity: 0.85 }}>
                Everyone we have ever met: hired, rejected, parked, withdrawn. Ranked by AI screen, grouped by role
                family, searchable forever. Every loop exits into it; the sourcing loop draws from it.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loop 1: Demand */}
      <section className="section">
        <div className="container">
          <span className="section-label">Loop 1 · Demand</span>
          <h2 className="section-title section-title--sm">
            Roles keep changing, the system keeps up
          </h2>
          <FlowRail
            steps={[
              { num: 'D1', title: 'Open the Role', cadence: 'One click', actor: 'human', actorLabel: 'Recruiter' },
              { num: 'D2', title: 'Publish the Posting', cadence: 'When ready', actor: 'human', actorLabel: 'Recruiter' },
              { num: 'D3', title: 'Pause / Reshape', cadence: 'As business shifts', actor: 'human', actorLabel: 'Recruiter' },
              { num: 'D4', title: 'Close or Reopen', cadence: 'Filled · closed · cancelled', actor: 'human', actorLabel: 'Recruiter' },
            ]}
            repeatNote="Roles reopen when demand returns, with their full applicant history intact."
          />
          <StepCards
            steps={[
              {
                num: 'D1',
                title: 'Open the role: the pipeline builds itself',
                cadence: 'One click',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    A recruiter opens the role from the Job Reqs list: title, employment type, location, remote
                    policy, salary band. The system sets up the same five-stage board every role uses (Screen, Interview,
                    Offer, Hired, Rejected), so no two roles run slightly different processes. The role is open for
                    hiring right away but stays off the public site until the posting is ready.
                  </p>
                ),
              },
              {
                num: 'D2',
                title: 'Publish, or don’t',
                cadence: 'When the JD is ready',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    The public posting is written on the role itself: the job description, a clean URL, and up to three
                    screening questions. Making it public puts it on the careers page. Some roles are never posted at
                    all and get filled from sourcing and the pool. The posting is one door among several, not the whole
                    process.
                  </p>
                ),
              },
              {
                num: 'D3',
                title: 'Roles pause, change shape, and reopen mid-search',
                cadence: 'Reality',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    Budgets move and priorities shift, and the role you start hiring for is not always the role you
                    finish hiring for. A role can go on hold and come back, and its description, salary band, and
                    screening questions can be edited mid-search. Candidates already in it keep their full history
                    through every change. Nothing resets just because the role changed.
                  </p>
                ),
              },
              {
                num: 'D4',
                title: 'Closing a role is not the end of its candidates',
                cadence: 'Filled, closed, or cancelled',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    Closing a role records an outcome (filled, closed without a hire, or cancelled) and takes it off
                    the careers page automatically. The candidates in it do not disappear: they move into the pool with
                    their screens, ratings, and notes attached, and the strong ones show up first when a similar role
                    opens. Reopening a role picks up right where it left off.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Loop 2: Sourcing */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            Loop 2 · Sourcing
          </span>
          <h2 className="section-title section-title--sm">
            Always on, across every channel
          </h2>
          <FlowRail
            steps={[
              { num: 'S1', title: 'Inbound', cadence: 'Careers page', actor: 'contractor', actorLabel: 'Candidate' },
              { num: 'S2', title: 'Outbound + Referrals', cadence: 'Continuous', actor: 'human', actorLabel: 'Recruiter' },
              { num: 'S3', title: 'Agencies', cadence: 'Per engagement', actor: 'contractor', actorLabel: 'Agency' },
              { num: 'S4', title: 'Batch Drop', cadence: 'Up to 25 resumes', actor: 'ai', actorLabel: 'Claude' },
              { num: 'S5', title: 'Pool Resurfacing', cadence: 'Every new role', actor: 'system' },
            ]}
            repeatNote="Sourcing never stops when a role is filled. The loop keeps feeding the pool for the next one."
          />
          <StepCards
            steps={[
              {
                num: 'S1',
                title: 'Inbound from the careers page',
                cadence: 'Whenever candidates apply',
                actor: 'contractor',
                actorLabel: 'Candidate',
                body: (
                  <p>
                    A candidate applies with a resume, cover letter, and answers to the role’s screening questions. The
                    application lands in the talent system attached to the role. No inbox, no forwarding, no resume that
                    lives only in one person’s email.
                  </p>
                ),
              },
              {
                num: 'S2',
                title: 'Outbound, referrals, and everything in between',
                cadence: 'Continuous',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    LinkedIn sourcing, team referrals, event contacts, and agency submissions all run alongside inbound
                    applications. Sourcing is always on, not a burst that starts when a role opens. Every channel is
                    tagged when the candidate comes in (sourced, referral, agency, LinkedIn, job board, event), so the
                    system can later tell which channels actually produce hires.
                  </p>
                ),
              },
              {
                num: 'S3',
                title: 'Agencies feed the same funnel',
                cadence: 'Per engagement',
                actor: 'contractor',
                actorLabel: 'Agency',
                body: (
                  <p>
                    Agency candidates come in through the same doors and get the same treatment as everyone else: the
                    same AI screen, the same two gates, the same record. No separate spreadsheet for agency
                    submissions. One record no matter who found the person.
                  </p>
                ),
              },
              {
                num: 'S4',
                title: 'The batch drop: 25 resumes at a time',
                cadence: 'AI prefill, human review',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <p>
                    Sourced resumes come in batches: a recruiter drops up to 25 files at once and the AI reads each one,
                    filling in a draft with name, email, phone, LinkedIn, headline, and current title. The recruiter
                    checks and saves each one. Ten minutes of drag-and-drop replaces an afternoon of typing, and
                    duplicates can’t happen: people are matched by email, one application per person per role, so
                    re-adding someone opens their existing record instead of making a second.
                  </p>
                ),
              },
              {
                num: 'S5',
                title: 'The pool is a sourcing channel',
                cadence: 'First stop for every new role',
                actor: 'system',
                body: (
                  <p>
                    When a role opens, sourcing starts from everyone the company has already met. The pool is ranked by
                    best AI screen and grouped by role family, so last quarter’s strong runner-up shows up at the top of
                    this quarter’s search with full history attached. The easiest candidate to find is the one you
                    already found.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Loop 3: Selection */}
      <section className="section">
        <div className="container">
          <span className="section-label">Loop 3 · Selection</span>
          <h2 className="section-title section-title--sm">
            The real flowchart, every branch included
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            One candidate’s path through selection. Solid lines are the working process; dashed lines are the pool’s
            memory. Every “no” leads somewhere, and none of them is a shredder.
          </p>
          <SelectionFlowchart />

          <div className="wf-info-grid" style={{ marginTop: 40 }}>
            <div className="wf-info-card">
              <h3>AI on the interview panel</h3>
              <ul>
                <li>The AI holds a seat on every round, from the recruiter screen to the founder chat, and a round with three people hands in four scorecards</li>
                <li>It scores against that round’s rubric with an advance, hold, or reject call, citing the exact lines and timestamps it used</li>
                <li>Its scorecard stays sealed until every person on the round has submitted, so it can never anchor the room</li>
                <li>It carries memory forward: anything a transcript left unproven becomes a question for the next round</li>
                <li>Rough transcription is handled, not trusted: it flags low-confidence quotes and never holds a garbled transcript against the candidate</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Human and AI, side by side</h3>
              <ul>
                <li>Two separate reads at the resume, and again at every interview, catch what one reader alone would miss</li>
                <li>The AI gives its read with evidence; the people make the decision</li>
                <li>When two scores are a full point apart, that gap is raised in the debrief, not averaged away</li>
                <li>No one moves forward, or gets cut, on an AI score alone</li>
              </ul>
            </div>
          </div>

          <StepCards
            steps={[
              {
                num: 'C1',
                title: 'AI reads and scores every resume',
                cadence: 'Automatic, on arrival from any channel',
                actor: 'ai',
                actorLabel: 'Claude',
                body: (
                  <>
                    <p>
                      The moment an application lands, from any door, Claude reads the whole resume against the job
                      description and writes a structured screen: a 0 to 5 fit rating, a short overview, clear strengths
                      and gaps, a read on English, and the salary expectation and notice period exactly as stated, never
                      guessed. Every application gets the same careful read, whether it came in first or five
                      hundredth.
                    </p>
                    <p>
                      Scored candidates are also ranked within their role family, not just the one job they applied
                      to. A strong engineer who applied to the wrong opening still shows up near the top of the
                      engineering family.
                    </p>
                  </>
                ),
              },
              {
                num: 'C2',
                title: 'Two independent gates, three ways out',
                cadence: 'AI score + recruiter rating',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    Every application shows the AI’s score with its written reasoning next to the recruiter’s own star
                    rating. Weak on both: rejected, with the reason recorded, into the pool. Strong on both: on to the
                    screening call. The two disagree: a second person takes a look and decides, because disagreement is
                    a signal, not noise. No one is rejected by the AI alone.
                  </p>
                ),
              },
              {
                num: 'C3',
                title: 'The screening call, two ways out',
                cadence: 'Short recruiter call',
                actor: 'human',
                actorLabel: 'Recruiter',
                body: (
                  <p>
                    Before any formal interview, a recruiter talks to the candidate: motivation, expectations, notice
                    period, the things a resume can’t show. Right role at the right time: on to interviews. Wrong role
                    or wrong time: parked as future consideration, or marked as withdrew if the candidate steps
                    back. Either way the call notes go on the record, and the pool keeps them.
                  </p>
                ),
              },
              {
                num: 'C4',
                title: 'Interview rounds, with AI on the panel',
                cadence: 'One to several, sometimes repeated',
                actor: 'human',
                actorLabel: 'Hiring team',
                body: (
                  <>
                    <p>
                      The number of interviews is not fixed. A senior role may take three rounds plus a follow-up with a
                      different interviewer; a junior role may take one. Panel says yes: offer. Panel says no: rejected,
                      with the reason recorded. Panel is split: another round, and that step back is recorded like
                      any other. No off-the-record “can you talk to them once more” that the system never sees.
                    </p>
                    <p>
                      The AI sits on every interview panel too. It reads that transcript against the job description, the
                      resume, the earlier AI screen, the company’s core values, and every prior round, then fills in a
                      scorecard: an advance, hold, or reject call, a score for each thing the round is judged on, and the
                      exact quotes and timestamps it based them on. Where the transcription is rough, it flags the
                      low-confidence lines and never holds a garbled transcript against the candidate. Its scorecard
                      stays hidden until the human interviewers hand in theirs, so it can’t sway the room. It also
                      remembers the earlier rounds, so anything left unproven in one round becomes a question for the
                      next. The AI is one voice on the panel. It never makes the final call.
                    </p>
                    <p>
                      Everything about the candidate lives on the application: the notes, the resume (replaceable when a
                      better version arrives), the cover letter and answers, every scorecard from people and AI, and the
                      stage history. Anyone on the team can open it and know exactly where things stand.
                    </p>
                  </>
                ),
              },
              {
                num: 'C5',
                title: 'The offer, two ways out',
                cadence: 'Negotiated, sometimes lost',
                actor: 'human',
                actorLabel: 'Hiring team',
                body: (
                  <>
                    <p>
                      Offers get negotiated, and terms move both ways before they settle. Accepted: the application
                      flips to hired and hands off to the{' '}
                      <a href="/workflows/new-member-onboarding/">New Member Onboarding workflow</a>, which turns the
                      applicant record into an employee record without retyping anything. Declined: the search goes
                      back to the warm shortlist, still ranked and still in the system, not back to square
                      one.
                    </p>
                    <p>
                      Either way, the loop closes with a clear status and a recorded reason. No one is left in
                      limbo, and no outcome is silent.
                    </p>
                  </>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Every exit is a pool entry */}
      <section className="section" style={{ background: 'var(--tint)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'var(--white)' }}>
            The hub
          </span>
          <h2 className="section-title section-title--sm">
            Every exit is a pool entry
          </h2>
          <p className="section-sub" style={{ marginTop: 12 }}>
            “Rejected” is a status, not a delete. Every way out of the three loops lands in the pool with full
            history:
          </p>
          <div className="wf-info-grid" style={{ marginTop: 32 }}>
            <div className="wf-info-card">
              <h3>The ways out</h3>
              <ul>
                <li>Rejected, always with a recorded reason</li>
                <li>Withdrew: candidates change their minds; the door stays open</li>
                <li>Future consideration: right person, wrong timing, parked deliberately</li>
                <li>On hold / passive: still going but paused, usually with the role</li>
                <li>Hired: off to onboarding, still on the record</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>What the pool does with them</h3>
              <ul>
                <li>Ranks everyone by their best AI screen, across every application</li>
                <li>Groups by role family so the next search starts pre-sorted</li>
                <li>Keeps every screen, rating, and note attached to the person</li>
                <li>Feeds the sourcing loop: resurfaced candidates skip the cold start</li>
                <li>Honors a do-not-hire flag where the decision is final</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why it works */}
      <section className="section">
        <div className="container">
          <SevenElements elements={ELEMENTS} />
          <div className="wf-info-grid">
            <div className="wf-info-card">
              <h3>The standing rules</h3>
              <ul>
                <li>Every role runs the same five-stage board. The loops vary; the record doesn’t</li>
                <li>Every door produces the same structured record, agency or inbound alike</li>
                <li>The AI reads every resume in full as it arrives</li>
                <li>Backward is a normal direction, and every move is on the record</li>
                <li>The AI is on every interview panel and scores before it sees the people’s scores; it advises, it never decides</li>
                <li>No candidate is rejected by the AI alone, and every exit has a recorded reason</li>
                <li>Closing a role never throws away its candidates; nothing is ever deleted</li>
              </ul>
            </div>
            <div className="wf-info-card wf-info-card-mint">
              <h3>Why it works</h3>
              <ul>
                <li>The written process matches the real one, so people actually keep the system up to date</li>
                <li>One record ends the “where does this candidate stand” question</li>
                <li>Always-on sourcing means a new role starts warm, not cold</li>
                <li>Two separate gates catch what either one alone would miss</li>
                <li>Every interview is written down with its evidence and carried forward, so three rounds add up to one story instead of three separate opinions</li>
                <li>The pool builds up: every search makes the next one faster</li>
                <li>Declined offers and paused roles cost days, not restarts</li>
              </ul>
            </div>
          </div>
          <DetailFooter />
        </div>
      </section>
    </main>
  )
}
