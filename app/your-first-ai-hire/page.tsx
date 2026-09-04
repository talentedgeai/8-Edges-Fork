'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const testimonials = [
  { text: "I invited Dave to speak at the AI Summit in Sabah, and he was a natural on stage, bringing a fresh style the audience loved. We are looking forward to collaborating with the AI Officer Institute and Edge8 to bring their AI Certification Program to Malaysia.", name: 'Dato George Lim', role: 'Founder & CEO — G&A GROUP & GA SPACE', avatar: '/services/images/services-your-first-ai-hire-testimonials_Dato.jpg' },
  { text: "We were lucky enough to have Dave Hajdu work with our forum to help understand how AI is automating tasks and exploding output across a wide range of applications.", name: 'John VanNewkirk', role: 'YPO Gold Seattle, Forum 6', avatar: '/services/images/services-your-first-ai-hire-testimonials_John.jpg' },
  { text: "I am very grateful to Dave Hajdu, who spoke to graduate students in our international business and public policy program during our visit to Vietnam about Negotiations and AI.", name: 'Dr. Brooks Holtom', role: 'Professor of Management, Georgetown', avatar: '/services/images/services-your-first-ai-hire-testimonials_Dr Holtom.jpg' },
  { text: "Love the new look and branding. The website looks so good. I'm deeply grateful. The brand interview really made me think about our positioning and business in ways I never expected.", name: 'Dao Nguyen', role: 'Founder, DN Legal', avatar: '/services/images/services-your-first-ai-hire-testimonials_Dao Nguyen.jpg' },
  { text: "I can't stop looking at the new website and brand book. With Edge8's help, we're finally presenting ourselves the way we've always wanted. The speed, the quality, and the care were all top-notch.", name: 'Tuan Anh Le', role: 'Managing Partner, DN Legal', avatar: '/services/images/services-your-first-ai-hire-testimonials_Tuan Anh.jpg' },
  { text: "Working with Edge8 has been a pleasure. When I launched Fab Four Academy, I needed support to build a strong brand and digital presence. Dave and the team stepped in and delivered amazing results.", name: 'Dan Absher', role: 'CEO, Absher Construction Company', avatar: '/services/images/services-your-first-ai-hire-testimonials_Dan Absher.jpg' },
]

const T_COUNT_T = testimonials.length
const extTestimonials = [...testimonials, ...testimonials, ...testimonials]

export default function YourFirstAIHirePage() {
  const [activeExtIdx, setActiveExtIdx] = useState(T_COUNT_T)
  const viewportRefT = useRef<HTMLDivElement>(null)
  const trackRefT = useRef<HTMLDivElement>(null)
  const snapTimerRefT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSnappingRefT = useRef(false)
  const currentTestimonialT = ((activeExtIdx - T_COUNT_T) % T_COUNT_T + T_COUNT_T) % T_COUNT_T

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) } }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = viewportRefT.current
    const track = trackRefT.current
    if (!viewport || !track) return
    const cards = track.querySelectorAll<HTMLElement>('.t-card-svc')
    if (cards.length === 0) return
    const updateActive = () => {
      if (isSnappingRefT.current) return
      const cx = viewport.scrollLeft + viewport.offsetWidth / 2
      let closest = 0, minDist = Infinity
      cards.forEach((card, i) => {
        const cardCx = card.offsetLeft + card.offsetWidth / 2
        const dist = Math.abs(cx - cardCx)
        if (dist < minDist) { minDist = dist; closest = i }
      })
      setActiveExtIdx(closest)
      if (snapTimerRefT.current) clearTimeout(snapTimerRefT.current)
      const targetIdx = closest < T_COUNT_T ? closest + T_COUNT_T
        : closest >= T_COUNT_T * 2 ? closest - T_COUNT_T : -1
      if (targetIdx >= 0) {
        snapTimerRefT.current = setTimeout(() => {
          const pad = parseFloat(track.style.paddingLeft || '0')
          isSnappingRefT.current = true
          viewport.style.scrollSnapType = 'none'
          viewport.scrollLeft = cards[targetIdx].offsetLeft - pad
          setActiveExtIdx(targetIdx)
          requestAnimationFrame(() => {
            viewport.style.scrollSnapType = ''
            requestAnimationFrame(() => { isSnappingRefT.current = false })
          })
        }, 50)
      }
    }
    viewport.addEventListener('scroll', updateActive, { passive: true })
    const setEdgePadding = () => {
      if (!cards[T_COUNT_T]) return
      const cardW = cards[T_COUNT_T].offsetWidth
      const vw = viewport.offsetWidth
      const pad = Math.max(0, (vw - cardW) / 2)
      track.style.paddingLeft = `${pad}px`
      track.style.paddingRight = `${pad}px`
      viewport.scrollLeft = cards[T_COUNT_T].offsetLeft - pad
    }
    setEdgePadding()
    return () => {
      viewport.removeEventListener('scroll', updateActive)
      if (snapTimerRefT.current) clearTimeout(snapTimerRefT.current)
    }
  }, [])

  const scrollToTestimonialT = useCallback((realIdx: number) => {
    const viewport = viewportRefT.current
    const track = trackRefT.current
    if (!viewport || !track) return
    const cards = track.querySelectorAll<HTMLElement>('.t-card-svc')
    const pad = parseFloat(track.style.paddingLeft || '0')
    const extIdx = T_COUNT_T + realIdx
    if (cards[extIdx]) {
      viewport.scrollTo({ left: cards[extIdx].offsetLeft - pad, behavior: 'smooth' })
    }
  }, [currentTestimonialT])

  return (
    <main>
      {/* HERO */}
      <section className="svc-hero">
        <div className="svc-hero-bg" />
        <div className="svc-hero-grid" />
        <div className="container">
          <div className="svc-hero-inner">
            <div className="svc-hero-text">
              <h1>Your First AI Hire, Done Right</h1>
              <p className="svc-hero-sub">Stop guessing about AI. Get your first dedicated AI Officer in place within 30 days, and start seeing real results by Month 2.</p>
              <a href="https://ai-officer.typeform.com/letstalk" className="btn btn-contact" target="_blank" rel="noopener noreferrer">Claim Your Spot Now →</a>
            </div>
            <div className="svc-hero-img">
              <Image src="/services/images/services-your-first-ai-hire-hero-session.webp" alt="An Edge8 client and engineer in a working session" width={640} height={640} priority />
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Problem</span>
            <h2 className="section-title">Most Companies Fail at AI Before They Start</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>The bottleneck isn&apos;t the technology. It&apos;s the leadership.</p>
          </div>
          <div className="problem-cards" style={{ marginTop: 48 }}>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              </div>
              <div className="problem-card-title">No One Owns AI</div>
              <p className="problem-card-desc">Everyone&apos;s &quot;exploring&quot; AI tools, but no one is accountable for results. Without an owner, nothing gets implemented.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className="problem-card-title">Wrong Hire, Wrong Cost</div>
              <p className="problem-card-desc">A full-time AI executive costs $150K–$300K+ and takes 6+ months to hire. Most companies can&apos;t afford to wait or to guess.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              </div>
              <div className="problem-card-title">Scattered Experiments</div>
              <p className="problem-card-desc">Teams run disconnected AI pilots that never scale. Without strategic direction, you get 10% of the potential value.</p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="problem-card-title">Missed Window</div>
              <p className="problem-card-desc">Your competitors are moving now. Every month without AI leadership is a month of competitive advantage lost forever.</p>
            </div>
          </div>
        </div>
      </section>

      {/* THE SOLUTION */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Solution</span>
            <h2 className="section-title">Your Dedicated AI Officer, Without the $300K Mistake</h2>
          </div>
          <div className="timeline-steps" style={{ marginTop: 48 }}>
            {[
              { month: 'Month 1', label: 'Phase 1', title: 'Train & First Wins', desc: 'Your AI Officer joins the team, works alongside our AI engineers building real AI programs, and begins their AI Officer Certification in both Generative and Agentic AI. First wins ship this month.', cost: '$1,800' },
              { month: 'Month 2', label: 'Phase 2', title: 'Collaborate', desc: 'Foundation established. AI Officer Certification continues. They start contributing as a collaborator, helping build AI programs for your company.', cost: '$1,800' },
              { month: 'Month 3', label: 'Phase 3', title: 'Scale & Systemize', desc: 'AI Officer Certification complete. Programs scale across your workflows so your team operates more autonomously.', cost: '$1,800' },
            ].map((step, i) => (
              <div key={i} className="timeline-step">
                <div className="timeline-left">
                  <div className={`timeline-dot${i === 2 ? ' mint' : ''}`}>{i + 1}</div>
                </div>
                <div className="timeline-right">
                  <div className="timeline-label">{step.month} · {step.label} · <strong style={{ color: 'var(--blue)' }}>{step.cost}</strong></div>
                  <div className="timeline-title">{step.title}</div>
                  <div className="timeline-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="guarantee-box reveal">
            <div className="guarantee-box-title">⚡ Our Guarantee</div>
            <p>If you don&apos;t see measurable AI impact within 90 days, we work for free until you do. We&apos;re that confident.</p>
          </div>
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)', marginBottom: 16 }}>After Month 3</p>
            <p style={{ fontSize: 15, color: 'var(--grey-mid)', lineHeight: 1.65 }}>You have a fully operational AI program, a trained team, and the option to hire your AI Officer full-time, continue with Edge8, or run independently with our playbook.</p>
          </div>
        </div>
      </section>

      {/* THE MATH */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Math</span>
            <h2 className="section-title">$5,400 vs $150,000+</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>The numbers make this decision obvious.</p>
          </div>
          <div className="math-compare" style={{ marginTop: 48 }}>
            <div className="math-box good reveal">
              <div className="math-price" style={{ color: 'var(--color-ok-strong)' }}>$5,400</div>
              <div className="math-label">Edge8 AI Officer Program (3 months)</div>
              <ul style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0 }}>
                {['Dedicated AI Officer on Day 1', 'First program live by Month 1', 'AI Officer Certification (Generative + Agentic) included', 'Full team training included', 'ROI guarantee', 'No long-term commitment'].map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--grey-mid)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--color-ok-strong)', fontWeight: 500 }}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="math-box bad reveal">
              <div className="math-price" style={{ color: 'var(--color-err-strong)' }}>$150,000+</div>
              <div className="math-label">Hiring a Full-Time AI Executive</div>
              <ul style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0 }}>
                {['6+ months to hire', 'No guarantee of results', 'Risk of wrong hire', 'Benefits & equity on top', 'You get one person\'s knowledge'].map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--grey-mid)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--color-err-strong)', fontWeight: 500 }}>✗</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Who It&apos;s For</span>
            <h2 className="section-title">Built for Ambitious Founders</h2>
          </div>
          <div className="who-grid" style={{ marginTop: 48 }}>
            <div className="who-card reveal">
              <div className="who-card-title">You&apos;re in the Right Place If...</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, marginTop: 12 }}>
                {['$2M–$50M revenue business', 'CEO/founder ready to commit to AI', '10–500 employees', 'Specific business problems to solve', 'Want ROI within 90 days'].map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--grey-mid)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 500 }}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="who-card reveal">
              <div className="who-card-title">This Is NOT for You If...</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, marginTop: 12 }}>
                {['You want AI magic without effort', 'You\'re not ready to change processes', 'You\'re looking for a quick fix', 'You don\'t believe AI has real business value'].map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--grey-mid)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--color-err-strong)', fontWeight: 500 }}>✗</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* MEET THE FOUNDER */}
      <section className="section">
        <div className="container">
          <div className="meet-dave">
            <div className="reveal">
              <span className="section-label">Meet the Founder</span>
              <h2 className="section-title">Dave Hajdu, CAIO</h2>
              <p style={{ fontSize: 17, color: 'var(--grey-mid)', lineHeight: 1.75, marginTop: 16 }}>
                Dave spent 25 years in tech, from automating millions of rows of data at Microsoft to founding EO Vietnam and building AI programs for 50+ companies. He created the AI Officer Certification, now deployed across Southeast Asia and North America.
              </p>
              <p style={{ fontSize: 17, color: 'var(--grey-mid)', lineHeight: 1.75, marginTop: 16 }}>
                When you work with Edge8, you get Dave&apos;s methodology, his team&apos;s execution, and a proven system for turning AI experiments into business results.
              </p>
              <a href="https://ai-officer.typeform.com/letstalk" className="btn btn-primary" style={{ marginTop: 28 }} target="_blank" rel="noopener noreferrer">Schedule Your Free Consultation</a>
            </div>
            <Image src="/services/images/services-your-first-ai-hire-Dave Hajdu.jpeg" alt="Dave Hajdu" width={480} height={640} className="meet-dave-img reveal" />
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials section">
        <div className="container">
          <div className="testimonials-header reveal">
            <span className="section-label">Testimonials</span>
            <h2 className="section-title">What Our Clients Say</h2>
          </div>
        </div>
        <div className="container" style={{ overflow: 'visible' }}>
          <div className="testimonials-viewport" ref={viewportRefT}>
            <div className="testimonials-track" ref={trackRefT}>
              {extTestimonials.map((t, i) => (
                <div key={i} className={`testimonial-card t-card-svc${i === activeExtIdx ? ' active' : ''}`}>
                  <span className="testimonial-quote">&ldquo;</span>
                  <p className="testimonial-text">{t.text}</p>
                  <div className="testimonial-person">
                    <Image src={t.avatar} alt={t.name} width={52} height={52} className="testimonial-avatar" />
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-role">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="testimonials-nav">
            <div className="testimonials-dots">
              {testimonials.map((_, i) => (
                <button key={i} className={`testimonials-dot${i === currentTestimonialT ? ' active' : ''}`} onClick={() => scrollToTestimonialT(i)} aria-label={`Go to testimonial ${i + 1}`} />
              ))}
            </div>
            <div className="testimonials-arrows">
              <button className="testimonials-arrow" onClick={() => scrollToTestimonialT((currentTestimonialT - 1 + T_COUNT_T) % T_COUNT_T)} aria-label="Previous">
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="testimonials-arrow" onClick={() => scrollToTestimonialT((currentTestimonialT + 1) % T_COUNT_T)} aria-label="Next">
                <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="contact-blue section">
        <div className="container">
          <div className="contact-blue-inner">
            <div className="reveal">
              <h2 className="section-title" style={{ marginBottom: 16 }}>Ready to Make Your First AI Hire?</h2>
              <p className="section-sub">77 spots remaining this year. Claim yours before your competitor does.</p>
            </div>
            <div className="contact-blue-cta reveal">
              <a href="https://ai-officer.typeform.com/letstalk" className="btn btn-contact" target="_blank" rel="noopener noreferrer">Claim Your Spot Now →</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
