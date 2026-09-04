'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getCaseStudiesByCategory } from '@/lib/caseStudies'

const caseStudies = getCaseStudiesByCategory('ai-programs')

export default function AiProgramsPage() {
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
      <section className="page-hero">
        <div className="container">
          <div className="page-hero-inner">
            <h1 className="section-title">Ship 3 AI Agents a Quarter. Without Hiring a CTO.</h1>
            <p className="page-hero-sub">We design, build, and deploy AI agents that take the highest-volume work off your team. Most clients see their first agent in production inside 30 days, with the next two close behind.</p>
          </div>
        </div>
      </section>

      {/* WHAT IS AN AI PROGRAM */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">What Is an AI Program</span>
            <h2 className="section-title">More Than Tools. A System of AI Agents.</h2>
            <p style={{ fontSize: 17, color: 'var(--grey-mid)', lineHeight: 1.75, marginTop: 16, maxWidth: 760 }}>
              An AI Program is a coordinated system of AI agents that work together to automate your business processes, analyze your data, and execute your marketing, running 24/7 without human intervention. Think of it as building a team of AI employees, each trained for a specific function.
            </p>
          </div>
          <div className="ai-program-stats" style={{ marginTop: 48 }}>
            <div className="ai-stat-card reveal">
              <div className="ai-stat-num">Route</div>
              <p className="ai-stat-label">Information through your organization with intelligent AI routing agents that know where data needs to go</p>
            </div>
            <div className="ai-stat-card reveal">
              <div className="ai-stat-num">Monitor</div>
              <p className="ai-stat-label">Critical business data 24/7 with AI agents that alert, analyze, and act on what matters most</p>
            </div>
            <div className="ai-stat-card reveal">
              <div className="ai-stat-num">Execute</div>
              <p className="ai-stat-label">Marketing, sales, and operations tasks automatically, so your team focuses on strategy, not execution</p>
            </div>
          </div>
        </div>
      </section>

      {/* CASE STUDIES */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Case Studies</span>
            <h2 className="section-title">AI Programs We&apos;ve Built</h2>
          </div>
          <div className="cs-grid" style={{ marginTop: 48 }}>
            {caseStudies.map((cs) => (
              <Link key={cs.slug} href={`/case-studies/${cs.slug}`} className="cs-card reveal">
                <Image src={cs.image} alt={cs.title} width={600} height={220} className="cs-card-img" />
                <div className="cs-card-body">
                  <div className="cs-card-title">{cs.title}</div>
                  <p className="cs-card-desc">{cs.description}</p>
                  <div className="cs-card-highlights">
                    {cs.highlights.map((h) => (
                      <span key={h} className="cs-card-highlight">{h}</span>
                    ))}
                  </div>
                  <span className="cs-card-more">View Case Study →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
