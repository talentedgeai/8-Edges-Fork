'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function TrainingAndCertificationPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) } }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <main>
      {/* HERO */}
      <section className="svc-hero">
        <div className="svc-hero-bg" />
        <div className="svc-hero-grid" />
        <div className="container">
          <div className="svc-hero-inner">
            <div className="svc-hero-text">
              <h1>Turn Your Managers Into AI Leaders. 500+ Certified, 12 Months, 3 Hrs Per Week.</h1>
              <p className="svc-hero-sub">The AI Officer Certification Program is the proven curriculum that turns managers into AI leaders and experiments into programs your team can run without us.</p>
              <a href="https://www.ai-officer.com" className="btn btn-contact" target="_blank" rel="noopener noreferrer">Explore the Program →</a>
            </div>
            <div className="svc-hero-img">
              <Image src="/services/images/services-training-and-certification-hero-cohort.webp" alt="An AI Officer certification cohort working together at the Saigon retreat" width={640} height={640} priority />
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Problem</span>
            <h2 className="section-title">Why Most AI Training Programs Fail</h2>
          </div>
          <div className="problem-cards" style={{ marginTop: 48 }}>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </div>
              <div className="problem-card-title">No Starting Point</div>
              <p className="problem-card-desc">Teams don&apos;t know where to begin with AI. Generic training gives frameworks, not answers.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="problem-card-title">No Shared Language</div>
              <p className="problem-card-desc">Leadership, IT, and business teams can&apos;t agree on AI priorities because they don&apos;t speak the same language.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5m4 0h10m-4 7l3-3-3-3M5 19l-3-3 3-3"/></svg>
              </div>
              <div className="problem-card-title">Experiments, Not Programs</div>
              <p className="problem-card-desc">Employees learn AI tools but never build AI systems. Training produces curiosity, not capability.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div className="problem-card-title">Falling Behind</div>
              <p className="problem-card-desc">The AI landscape changes monthly. One-time training creates skills that are outdated in 6 months.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PROGRAM OVERVIEW */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Program</span>
            <h2 className="section-title">AI Officer Certification Program</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>A structured 12-month curriculum that builds real AI capability across your entire organization.</p>
          </div>
          <div className="program-stats" style={{ marginTop: 48 }}>
            {[
              { num: '12', label: 'Months' },
              { num: '3 hrs', label: 'Per Week' },
              { num: '100%', label: 'Online' },
              { num: 'All', label: 'Functions' },
            ].map((stat) => (
              <div key={stat.label} className="prog-stat reveal">
                <div className="prog-stat-num">{stat.num}</div>
                <div className="prog-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE SERIES */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Curriculum</span>
            <h2 className="section-title">Three Series. One Transformation.</h2>
          </div>
          <div className="series-grid" style={{ marginTop: 48 }}>
            <div className="series-card reveal">
              <div className="series-badge">Series 1</div>
              <div className="series-title">Generative AI Foundations</div>
              <div className="series-items">
                {['AI fundamentals & tools', 'Prompt engineering mastery', 'Content creation automation', 'AI ethics & governance', 'Building your first AI workflow'].map((item) => (
                  <div key={item} className="series-item">{item}</div>
                ))}
              </div>
            </div>
            <div className="series-card featured reveal">
              <div className="series-badge" style={{ color: 'var(--blue)' }}>Series 2 · Most Popular</div>
              <div className="series-title">Agentic AI Systems</div>
              <div className="series-items">
                {['AI agent design & deployment', 'Multi-agent orchestration', 'Data systems & pipelines', 'CRM & process automation', 'AI program management'].map((item) => (
                  <div key={item} className="series-item">{item}</div>
                ))}
              </div>
            </div>
            <div className="series-card reveal">
              <div className="series-badge">Series 3</div>
              <div className="series-title">Business AI Strategy</div>
              <div className="series-items">
                {['AI business case development', 'ROI measurement frameworks', 'AI talent strategy', 'Change management for AI', 'AI governance & compliance'].map((item) => (
                  <div key={item} className="series-item">{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRACK RECORD */}
      <section className="section">
        <div className="container">
          <div className="track-record reveal">
            <span className="section-label" style={{ color: 'var(--mint)', background: 'color-mix(in srgb, var(--color-accent-mint) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent-mint) 35%, transparent)' }}>Track Record</span>
            <h2 className="section-title" style={{ color: 'var(--color-bg-primary)', marginBottom: 0 }}>Proven Results Across Southeast Asia &amp; North America</h2>
            <div className="track-record-grid">
              {[
                'Certified 500+ AI Officers across Asia & North America',
                'Deployed in Fortune 500 companies & SMEs alike',
                'MOU signed with Malaysia AI Summit to expand program',
                'Curriculum updated quarterly with latest AI developments',
              ].map((item) => (
                <div key={item} className="track-item">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* MEET THE CAIO */}
      <section className="section">
        <div className="container">
          <div className="meet-dave">
            <div className="reveal">
              <span className="section-label">Meet the CAIO</span>
              <h2 className="section-title">Dave Hajdu, CAIO</h2>
              <p style={{ fontSize: 17, color: 'var(--grey-mid)', lineHeight: 1.75, marginTop: 16 }}>
                Dave is the architect of the AI Officer Certification Program. With 25 years in enterprise technology and a track record of implementing AI programs in 50+ organizations across Asia and North America, he brings real-world AI implementation experience to every training session.
              </p>
              <div style={{ display: 'flex', gap: 16, marginTop: 28, flexWrap: 'wrap' }}>
                <a href="https://www.ai-officer.com" className="btn btn-primary" target="_blank" rel="noopener noreferrer">Explore the AI Officer Institute</a>
              </div>
            </div>
            <Image src="/services/images/services-training-and-certification-Dave Hajdu.jpeg" alt="Dave Hajdu" width={480} height={640} className="meet-dave-img reveal" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="contact-blue section">
        <div className="container">
          <div className="contact-blue-inner">
            <div className="reveal">
              <h2 className="section-title" style={{ marginBottom: 16 }}>Ready to Build AI Leadership?</h2>
              <p className="section-sub">Join hundreds of organizations already using the AI Officer Certification to drive real results.</p>
            </div>
            <div className="contact-blue-cta reveal">
              <a href="https://www.ai-officer.com" className="btn btn-contact" target="_blank" rel="noopener noreferrer">Explore the Program →</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
