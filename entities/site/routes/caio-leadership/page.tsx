'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function CaioLeadershipPage() {
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
              <div className="page-hero-urgency u-mb-5">For founders whose boards just asked about AI strategy.</div>
              <h1>Get C-Level AI Leadership Without the $300K Mistake</h1>
              <p className="svc-hero-sub">Most companies don&apos;t need a $300K full-time CAIO. They need strategic AI leadership that drives real results, without the risk of the wrong hire.</p>
              <a href="/contact" className="btn btn-contact">Book a Conversation →</a>
            </div>
            <div className="svc-hero-img">
              <Image src="/services/images/services-caio-leadership-hero-dave.webp" alt="Dave Hajdu leading an AI strategy session" width={640} height={640} priority />
            </div>
          </div>
        </div>
      </section>

      {/* THE PATTERN */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Problem</span>
            <h2 className="section-title">You Wouldn&apos;t Hire a VP of Sales Without a Proven Sales System</h2>
            <p className="section-sub u-mt-4">So why hire an AI executive before you have an AI system?</p>
          </div>
          <div className="problem-cards u-mt-8">
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <div className="problem-card-title">The VP Sales Trap</div>
              <p className="problem-card-desc">Companies hire a VP Sales before they have a repeatable sales process. The hire fails. They blame the person, not the system.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16"/></svg>
              </div>
              <div className="problem-card-title">The CMO Trap</div>
              <p className="problem-card-desc">Companies hire a CMO before they know their customer. Millions spent on campaigns. Zero ROI. The CMO is gone in 18 months.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div className="problem-card-title">The CFO Trap</div>
              <p className="problem-card-desc">Companies hire a CFO before they have clean books. The CFO spends all their time on cleanup instead of strategy.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M8.46 8.46a5 5 0 0 0 0 7.07"/></svg>
              </div>
              <div className="problem-card-title">The CAIO Trap</div>
              <p className="problem-card-desc">Companies hire a CAIO before they have an AI program. The hire costs $300K+, takes 6 months, and often fails. We break this cycle.</p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Comparison</span>
            <h2 className="section-title">Fractional CAIO vs Full-Time CAIO</h2>
          </div>
          <div className="comparison-wrap reveal u-mt-8">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Full-Time CAIO</th>
                  <th>Edge8 Fractional CAIO</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Annual Cost', '$200K–$350K + benefits + equity', 'Starting at $5,400 / quarter'],
                  ['Time to Start', '4–8 months to hire', 'Day 1'],
                  ['Risk', 'Wrong hire = $300K mistake', 'ROI guarantee or we work free'],
                  ['Scalability', 'Fixed headcount', 'Scale up or down as needed'],
                  ['Experience', 'One person\'s knowledge', 'Entire Edge8 team + methodology'],
                  ['First Results', '3–6 months minimum', 'Within 30–60 days'],
                ].map(([factor, bad, good]) => (
                  <tr key={factor}>
                    <td className="site-cell-factor">{factor}</td>
                    <td className="u-err-strong">{bad}</td>
                    <td className="site-cell-good">{good}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* THREE PATHS */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Three Paths</span>
            <h2 className="section-title">Choose Your AI Leadership Model</h2>
          </div>
          <div className="choice-grid u-mt-8">
            <div className="choice-card reveal">
              <div className="choice-label">Option A</div>
              <div className="choice-title">Strategic Advisory</div>
              <p className="choice-desc">Dave Hajdu serves as your advisory CAIO, attending key meetings, guiding AI strategy, and helping you build internal capability over time.</p>
              <div className="choice-outcome">Best for: Companies beginning their AI journey</div>
            </div>
            <div className="choice-card featured reveal">
              <div className="choice-label">Option B · Most Popular</div>
              <div className="choice-title">Fractional CAIO</div>
              <p className="choice-desc">Dedicated part-time AI leadership embedded in your organization. We own the AI program, manage the team, and drive results, just like a full-time executive.</p>
              <div className="choice-outcome">Best for: Companies scaling AI programs</div>
            </div>
            <div className="choice-card reveal">
              <div className="choice-label">Option C</div>
              <div className="choice-title">CAIO-in-Residence</div>
              <p className="choice-desc">Full-time embedded AI leadership for a fixed period. We build the program, hire and train internal talent, then transition out when you&apos;re self-sufficient.</p>
              <div className="choice-outcome">Best for: Companies ready to go all-in</div>
            </div>
          </div>
        </div>
      </section>

      {/* 90-DAY ROADMAP */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Roadmap</span>
            <h2 className="section-title">Your 90-Day AI Leadership Journey</h2>
          </div>
          <div className="timeline-steps u-mt-8 u-max-7">
            {[
              { month: 'Month 1', title: 'AI Landscape Assessment', desc: 'We audit your current AI usage, data infrastructure, and team capabilities. We establish quick wins and build your AI roadmap.' },
              { month: 'Month 2–3', title: 'Program Design & First Implementation', desc: 'We design and launch your highest-ROI AI program. Your team is trained. Processes are established. Results start appearing.' },
              { month: 'Month 4–6', title: 'Scale & Systematize', desc: 'We expand successful programs across your organization, build internal AI capability, and establish governance and measurement systems.' },
            ].map((step, i) => (
              <div key={i} className="timeline-step">
                <div className="timeline-left">
                  <div className={`timeline-dot${i === 2 ? ' mint' : ''}`}>{i + 1}</div>
                </div>
                <div className="timeline-right">
                  <div className="timeline-label">{step.month}</div>
                  <div className="timeline-title">{step.title}</div>
                  <div className="timeline-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Who It&apos;s For</span>
            <h2 className="section-title">Built for Ambitious Organizations</h2>
          </div>
          <div className="who-grid-4 u-mt-8">
            <div className="who-card-4 reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div className="who-card-title">Series A/B Startups</div>
              <p className="who-card-desc">Build AI into your product and operations before your competitors do.</p>
            </div>
            <div className="who-card-4 reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              </div>
              <div className="who-card-title">Mid-Market Companies</div>
              <p className="who-card-desc">$10M–$100M companies ready to use AI for competitive advantage.</p>
            </div>
            <div className="who-card-4 reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect x="8" y="11" width="8" height="10"/></svg>
              </div>
              <div className="who-card-title">Private Equity Portfolio</div>
              <p className="who-card-desc">Deploy AI across your portfolio for faster value creation.</p>
            </div>
            <div className="who-card-4 reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </div>
              <div className="who-card-title">Enterprise Divisions</div>
              <p className="who-card-desc">Move faster than corporate IT by building your own AI capability.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="site-contact-blue section">
        <div className="container">
          <div className="site-contact-blue-inner">
            <div className="reveal">
              <h2 className="section-title u-mb-4">Ready for AI Leadership That Delivers?</h2>
              <p className="section-sub">Schedule a free consultation to find the right CAIO model for your organization.</p>
            </div>
            <div className="site-contact-blue-cta reveal">
              <a href="https://ai-officer.typeform.com/letstalk" className="btn btn-contact" target="_blank" rel="noopener noreferrer">Start Your AI Program →</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
