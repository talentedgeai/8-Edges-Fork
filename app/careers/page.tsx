import Link from 'next/link'
import { getActiveJobs } from '@/lib/jobs'

// Postings come live from the ATS — render per-request so publishing a role
// in the admin shows up without a redeploy.
export const dynamic = 'force-dynamic'
import JobCard from './JobCard'
import RevealObserver from './RevealObserver'
import HeroStats from '@/components/HeroStats'

export default async function CareersPage() {
  const jobs = await getActiveJobs()

  return (
    <main>
      <RevealObserver />

      {/* ═══ HERO ════════════════════════════════════════════ */}
      <section className="site-careers-hero">
        <div className="site-careers-hero-glow" />
        <div className="container">
          <div className="site-careers-hero-inner reveal">
            <span
              className="site-section-label site-chip--glass"
            >
              Join Edge8
            </span>
            <h1>
              Help Founders<br />Lead AI.
            </h1>
            <p className="site-careers-hero-sub">
              Edge8 is at the frontier of AI adoption in business. We don&rsquo;t
              talk about AI — we build agents, deploy automation, and run it live
              inside companies. If that&rsquo;s where you want to work, keep reading.
            </p>
            <div className="site-careers-hero-ctas">
              <a href="#open-roles" className="btn site-btn-secondary">
                See Open Roles ↓
              </a>
              <Link href="/about" className="btn site-btn-ghost">
                About Edge8
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HERO STATS STRIP ═══════════════════════════════ */}
      <HeroStats />

      {/* ═══ WHY WORK HERE ════════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Why Edge8</span>
            <h2 className="site-section-title">A Different Kind of AI Company</h2>
            <p className="site-section-sub u-mt-4">
              We practice what we sell. Every tool, workflow, and agent we recommend
              — we&rsquo;ve already built and run ourselves.
            </p>
          </div>

          <div className="site-careers-why-grid">
            <div className="site-careers-why-card reveal">
              <div className="site-careers-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3>At the Frontier</h3>
              <p>
                We use Claude Code, build AI agents, and deploy automation before
                most companies understand what that means. You won&rsquo;t find this
                kind of work anywhere else.
              </p>
            </div>

            <div className="site-careers-why-card reveal">
              <div className="site-careers-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <h3>Impact You Can Measure</h3>
              <p>
                We don&rsquo;t make slide decks. We build workflows that save
                40-hour weeks and create revenue streams. Your work has real
                numbers attached to it.
              </p>
            </div>

            <div className="site-careers-why-card reveal">
              <div className="site-careers-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3>A Team That Moves</h3>
              <p>
                Small, focused, and opinionated. No approval chains, no death by
                committee. If you have a better idea, say so. We&rsquo;ll actually
                try it.
              </p>
            </div>

            <div className="site-careers-why-card reveal">
              <div className="site-careers-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h3>Grow with AI</h3>
              <p>
                AI isn&rsquo;t a feature here — it&rsquo;s the whole business.
                Working at Edge8 means learning faster, iterating more, and
                understanding AI-in-practice better than almost anyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WHAT WE LOOK FOR ════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="site-careers-mindset reveal">
            <span className="site-section-label">Who Thrives Here</span>
            <h2 className="site-section-title">We Hire for Mindset, Train for Skill</h2>
            <p className="site-section-sub u-mt-4">
              We&rsquo;re not looking for a specific résumé. We&rsquo;re looking for
              people who are genuinely curious about what AI can do next,
              uncomfortable with the way things were done before, and willing to
              figure out the rest as we go.
            </p>
            <div className="site-careers-traits">
              <span className="site-careers-trait">Bias toward action</span>
              <span className="site-careers-trait">Clear communicator</span>
              <span className="site-careers-trait">Fast learner</span>
              <span className="site-careers-trait">Genuinely curious</span>
              <span className="site-careers-trait">High standards</span>
              <span className="site-careers-trait">Comfortable with ambiguity</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ OPEN ROLES ═════════════════════════════════════ */}
      <section className="section site-section--tint" id="open-roles">
        <div className="container">
          <div className="site-careers-roles-header reveal">
            <div>
              <span className="site-section-label">Open Roles</span>
              <h2 className="site-section-title u-mt-3">
                {jobs.length > 0 ? 'Where You Fit In' : 'No Openings Right Now'}
              </h2>
            </div>
            {jobs.length > 0 && (
              <span className="site-job-count-badge">
                {jobs.length} open {jobs.length === 1 ? 'role' : 'roles'}
              </span>
            )}
          </div>

          {jobs.length > 0 ? (
            <div className="site-jobs-grid">
              {jobs.map((job) => (
                <JobCard key={job.slug} job={job} />
              ))}
            </div>
          ) : (
            <div className="site-careers-empty reveal">
              <div className="site-careers-empty-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="40"
                  height="40"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <p className="site-careers-empty-title">We&rsquo;re growing intentionally.</p>
              <p className="site-careers-empty-sub">
                No open roles right now — but when we do post, it&rsquo;ll be for
                the right person, not just a headcount. Drop us your background
                and we&rsquo;ll reach out when something fits.
              </p>
              <a
                href="mailto:hello@edge8.ai?subject=Expression of Interest — Edge8"
                className="btn btn-primary"
              >
                Express Interest →
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ═══ HOW WE HIRE ════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal u-center-text u-max-form u-mx-auto site-mb-56">
            <span className="site-section-label">The Process</span>
            <h2 className="site-section-title u-mt-3">How We Hire</h2>
            <p className="site-section-sub u-mt-4">
              No five-round interview loops. No take-home that eats your weekend.
              We move quickly, communicate directly, and respect your time.
            </p>
          </div>

          <div className="site-careers-process-steps">
            <div className="site-careers-process-step reveal">
              <div className="site-careers-step-num">1</div>
              <h3 className="site-careers-step-title">Drop Us a Note</h3>
              <p className="site-careers-step-desc">
                A short email with your background and why Edge8. No template, no
                cover-letter format. Just be direct about what you&rsquo;ve done and
                what you want to do next.
              </p>
            </div>
            <div className="site-careers-process-step reveal">
              <div className="site-careers-step-num">2</div>
              <h3 className="site-careers-step-title">A 30-Minute Conversation</h3>
              <p className="site-careers-step-desc">
                No homework before the call. We&rsquo;ll talk about what you&rsquo;ve
                built, how you think, and what kind of work you want next. You get
                a clear read on us too.
              </p>
            </div>
            <div className="site-careers-process-step reveal">
              <div className="site-careers-step-num">3</div>
              <h3 className="site-careers-step-title">A Small Paid Task</h3>
              <p className="site-careers-step-desc">
                If there&rsquo;s a fit, we&rsquo;ll give you a short, scoped project.
                You get paid for it. You evaluate us as much as we evaluate you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ EXPRESS INTEREST CTA ════════════════════════════ */}
      <section className="site-careers-cta-section">
        <div className="site-careers-cta-glow" />
        <div className="container">
          <div className="site-careers-cta-inner reveal">
            <span
              className="site-section-label site-chip--glass"
            >
              Stay Connected
            </span>
            <h2>
              Don&rsquo;t see a role?<br />We want to hear from you.
            </h2>
            <p>
              Good people don&rsquo;t always line up with open positions. If Edge8
              sounds like the right place to do your best work, send us your
              background. When a role opens that fits, you&rsquo;ll be the first
              to know.
            </p>
            <a
              href="mailto:hello@edge8.ai?subject=Expression of Interest — Edge8"
              className="btn site-btn-secondary site-careers-cta-btn"
            >
              hello@edge8.ai →
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
