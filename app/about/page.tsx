'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function AboutPage() {
  const [activeSlide, setActiveSlide] = useState(0)

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Experience slideshow
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % 3)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main>
      {/* ═══ HERO ═══════════════════════════════════════════════ */}
      <section className="about-hero">
        <div className="container">
          <div className="about-hero-inner">
            <div className="reveal">
              <span className="section-label" style={{ marginBottom: 16, display: 'inline-block' }}>The Founder POV</span>
              <h1 className="section-title" style={{ marginBottom: 24 }}>We&apos;ve Run AI Programs in 30+ Companies. We Built Ours First.</h1>
              <blockquote style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 2.8vw, 30px)', fontWeight: 500, lineHeight: 1.3, color: 'var(--dark)', borderLeft: '3px solid var(--blue)', paddingLeft: 20, margin: '0 0 16px' }}>
                &ldquo;It&apos;s not an AI problem. It&apos;s the data.&rdquo;
              </blockquote>
              <p style={{ fontSize: 14, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--grey-mid)' }}>
                Dave Hajdu, Founder
              </p>
            </div>
            <div className="about-hero-img-wrap reveal">
              <Image
                src="/about/images/about-Dave Hajdu.jpeg"
                alt="Dave Hajdu, Founder, Edge8"
                width={400}
                height={600}
                style={{ width: '100%', borderRadius: 'var(--radius)', objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DAVE'S STORY ═══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Founder</span>
            <h2 className="section-title">Dave Hajdu</h2>
            <p style={{ fontSize: 17, color: 'var(--grey-mid)', marginTop: 12, marginBottom: 40 }}>Our Founder&apos;s journey to becoming a Tech-Forward Founder began in 1999 as a data analyst at Microsoft.</p>
          </div>
          <div className="problem-cards">
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </div>
              <div className="problem-card-title">Enterprise AI Automation</div>
              <p className="problem-card-desc">Automated processes at Microsoft that moved millions of rows of data and managed millions of dollars in transactions.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </svg>
              </div>
              <div className="problem-card-title">Tech Innovation &amp; Development</div>
              <p className="problem-card-desc">Founded Vinasource, building web, iOS, and Android applications for the USTA, NCAA Tennis, MTV, and Microsoft.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </div>
              <div className="problem-card-title">Employee Engagement Solutions</div>
              <p className="problem-card-desc">Designed engagement programs for Fidelity, Sands Casino, and the Red Sox through TINYpulse, acquired by WebMD.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              </div>
              <div className="problem-card-title">Founder of EO Vietnam</div>
              <p className="problem-card-desc">Founded the Vietnam chapter of EO and serves as Southeast Asia Area Director, supporting 500+ businesses generating $8M–$100M annually.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ EXPERIENCE SLIDESHOW ════════════════════════════════ */}
      <section>
        <div className="exp-slideshow-wrap">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`exp-slide${activeSlide === n - 1 ? ' active' : ''}`}>
              <Image
                src={`/about/images/about-dave experience-${n}.jpg`}
                alt="Dave Hajdu experience"
                width={1200}
                height={675}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ MISSION ════════════════════════════════════════════ */}
      <section className="mission-section section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Mission</span>
            <h2 className="section-title">The Greatest Evolution in Productivity</h2>
            <p style={{ fontSize: 17, color: 'var(--grey-mid)', lineHeight: 1.75, marginTop: 20 }}>
              All these experiences have led to this pivotal moment: the greatest evolution in productivity our generation will witness. Automated AI agents. Edge8 is dedicated to helping founders and their teams orchestrate these resources so they too can become tech-forward.
            </p>
            <div className="mission-pull-quote">
              This journey is the most significant one we will undertake in our careers. Together with our founders&apos; and builders&apos; communities, we will navigate this new landscape, reach for limitless productivity, and become tech-forward.
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PARTNERS ════════════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Partners</span>
            <h2 className="section-title">The Team Behind Edge8</h2>
          </div>
          <div className="partners-grid" style={{ marginTop: 48 }}>
            <div className="partner-card reveal">
              <Image src="/about/images/about-partners-david-niu.jpg" alt="David Niu" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', margin: '0 auto 16px', display: 'block' }} />
              <div className="partner-card-name">David Niu</div>
              <p className="partner-card-role">Experienced serial entrepreneur and author. Co-Founder of TINYpulse, UC Berkeley &amp; Wharton.</p>
              <a href="https://www.linkedin.com/in/binyuled/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none', marginTop: 12 }}>LinkedIn →</a>
            </div>
            <div className="partner-card reveal">
              <Image src="/about/images/about-partners-eric enriquez.jpeg" alt="Eric Enriquez" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', margin: '0 auto 16px', display: 'block' }} />
              <div className="partner-card-name">Eric Enriquez</div>
              <p className="partner-card-role">Global leader in supply chain, AI automation, and business development. Worked with Nike, Reebok, Oakley.</p>
              <a href="https://www.eric-enriquez.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none', marginTop: 12 }}>Website →</a>
            </div>
            <div className="partner-card reveal">
              <Image src="/about/images/about-partners-jeff hu.jpg" alt="Jeff Hu" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', margin: '0 auto 16px', display: 'block' }} />
              <div className="partner-card-name">Jeff Hu</div>
              <p className="partner-card-role">20+ years in the service industry, building teams around shared culture and values. Contributing to SurrogateFirst.</p>
              <a href="https://www.linkedin.com/in/jeffhu/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none', marginTop: 12 }}>LinkedIn →</a>
            </div>
            <div className="partner-card reveal">
              <Image src="/about/images/about-partners-bin yu.jpg" alt="Bin Yu" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', margin: '0 auto 16px', display: 'block' }} />
              <div className="partner-card-name">Bin Yu</div>
              <p className="partner-card-role">Founder of HITLights, recognized as Young Businessperson of the Year. Focused on AI integration and expansion.</p>
              <a href="https://www.linkedin.com/in/binyuled/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none', marginTop: 12 }}>LinkedIn →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CONTACT ═════════════════════════════════════════════ */}
      <section className="section" style={{ background: 'var(--tint)' }}>
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center' }}>
            <h2 className="section-title" style={{ marginBottom: 48 }}>Get In Touch</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap', marginBottom: 48 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="none" stroke="var(--color-bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey-mid)' }}>Email</div>
                <div style={{ fontSize: 14, color: 'var(--dark)' }}><a href="mailto:dave@edge8.ai" style={{ color: 'inherit', textDecoration: 'none' }}>dave@edge8.ai</a></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="none" stroke="var(--color-bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.16a16 16 0 006.93 6.93l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey-mid)' }}>Vietnam</div>
                <div style={{ fontSize: 14, color: 'var(--dark)' }}>+84 90 995 8581</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="none" stroke="var(--color-bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.16a16 16 0 006.93 6.93l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey-mid)' }}>USA</div>
                <div style={{ fontSize: 14, color: 'var(--dark)' }}>+1 206 395 8872</div>
              </div>
            </div>
            <a href="https://www.linkedin.com/company/edge8ai/" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Connect on LinkedIn
            </a>
          </div>
        </div>
      </section>

      {/* ═══ AUDIT CTA ════════════════════════════════════════════ */}
      <section className="audit-cta section">
        <div className="container">
          <div className="audit-inner">
            <div className="audit-text reveal">
              <h2 className="section-title">Let&apos;s Talk About Your<br />AI Leverage</h2>
              <p>A real conversation, not a sales call. We will walk through your business and show you where AI gives you the leverage to 8x what your team ships.</p>
            </div>
            <div className="audit-cta-btn reveal">
              <a href="/contact" className="btn btn-primary">Book a Conversation</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
