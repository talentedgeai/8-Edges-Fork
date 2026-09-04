'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const testimonials = [
  { text: "The team Edge8 placed for us has been exceptional. They came AI-trained and ready to contribute from day one. We've doubled our output while cutting costs dramatically.", name: 'David Niu', role: 'Co-Founder, TINYpulse', avatar: '/services/images/services-global-staffing-testimonials-David Niu.jpg' },
  { text: "We were skeptical about remote global talent, but Edge8 changed our minds. The quality, professionalism, and AI capabilities of our new team members have exceeded every expectation.", name: 'Henry Albrecht', role: 'CEO, Limeade', avatar: '/services/images/services-global-staffing-testimonials-Henry Albrecht.jpg' },
]

const T_COUNT_GS = testimonials.length
const extTestimonialsGS = [...testimonials, ...testimonials, ...testimonials]

export default function GlobalStaffingPage() {
  const [activeExtIdxGS, setActiveExtIdxGS] = useState(T_COUNT_GS)
  const viewportRefGS = useRef<HTMLDivElement>(null)
  const trackRefGS = useRef<HTMLDivElement>(null)
  const snapTimerRefGS = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSnappingRefGS = useRef(false)
  const currentTestimonialGS = ((activeExtIdxGS - T_COUNT_GS) % T_COUNT_GS + T_COUNT_GS) % T_COUNT_GS

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) } }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = viewportRefGS.current
    const track = trackRefGS.current
    if (!viewport || !track) return
    const cards = track.querySelectorAll<HTMLElement>('.t-card-gs')
    if (cards.length === 0) return
    const updateActive = () => {
      if (isSnappingRefGS.current) return
      const cx = viewport.scrollLeft + viewport.offsetWidth / 2
      let closest = 0, minDist = Infinity
      cards.forEach((card, i) => {
        const cardCx = card.offsetLeft + card.offsetWidth / 2
        const dist = Math.abs(cx - cardCx)
        if (dist < minDist) { minDist = dist; closest = i }
      })
      setActiveExtIdxGS(closest)
      if (snapTimerRefGS.current) clearTimeout(snapTimerRefGS.current)
      const targetIdx = closest < T_COUNT_GS ? closest + T_COUNT_GS
        : closest >= T_COUNT_GS * 2 ? closest - T_COUNT_GS : -1
      if (targetIdx >= 0) {
        snapTimerRefGS.current = setTimeout(() => {
          const pad = parseFloat(track.style.paddingLeft || '0')
          isSnappingRefGS.current = true
          viewport.style.scrollSnapType = 'none'
          viewport.scrollLeft = cards[targetIdx].offsetLeft - pad
          setActiveExtIdxGS(targetIdx)
          requestAnimationFrame(() => {
            viewport.style.scrollSnapType = ''
            requestAnimationFrame(() => { isSnappingRefGS.current = false })
          })
        }, 50)
      }
    }
    viewport.addEventListener('scroll', updateActive, { passive: true })
    const setEdgePadding = () => {
      if (!cards[T_COUNT_GS]) return
      const cardW = cards[T_COUNT_GS].offsetWidth
      const vw = viewport.offsetWidth
      const pad = Math.max(0, (vw - cardW) / 2)
      track.style.paddingLeft = `${pad}px`
      track.style.paddingRight = `${pad}px`
      viewport.scrollLeft = cards[T_COUNT_GS].offsetLeft - pad
    }
    setEdgePadding()
    return () => {
      viewport.removeEventListener('scroll', updateActive)
      if (snapTimerRefGS.current) clearTimeout(snapTimerRefGS.current)
    }
  }, [])

  const scrollToTestimonialGS = useCallback((realIdx: number) => {
    const viewport = viewportRefGS.current
    const track = trackRefGS.current
    if (!viewport || !track) return
    const cards = track.querySelectorAll<HTMLElement>('.t-card-gs')
    const pad = parseFloat(track.style.paddingLeft || '0')
    const extIdx = T_COUNT_GS + realIdx
    if (cards[extIdx]) {
      viewport.scrollTo({ left: cards[extIdx].offsetLeft - pad, behavior: 'smooth' })
    }
  }, [currentTestimonialGS])

  return (
    <main>
      {/* HERO */}
      <section className="svc-hero">
        <div className="svc-hero-bg" />
        <div className="svc-hero-grid" />
        <div className="container">
          <div className="svc-hero-inner">
            <div className="svc-hero-text">
              <h1>Hire AI-Trained Engineers in Vietnam. 75% Less Than US Rates, Deployed in 3 Weeks.</h1>
              <p className="svc-hero-sub">Stop waiting six months to hire. Every engineer we place is trained in our AI Officer methodology before day one, so they ship work, not learn the basics.</p>
              <a href="/contact" className="btn btn-contact">Book a Conversation →</a>
            </div>
            <div className="svc-hero-img">
              <Image src="/services/images/services-global-staffing-hero.jpeg" alt="Global Staffing" width={640} height={480} priority />
            </div>
          </div>
        </div>
      </section>

      {/* WHY EDGE8 */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">Why Edge8</span>
            <h2 className="section-title">AI-Trained Talent at a Fraction of the Cost</h2>
          </div>
          <div className="who-grid-4" style={{ marginTop: 48 }}>
            <div className="who-card-4 reveal">
              <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--blue)', lineHeight: 1, marginBottom: 8 }}>75%</div>
              <div className="who-card-title">Cost Savings</div>
              <p className="who-card-desc">Save up to 75% compared to equivalent US or European talent, without sacrificing quality.</p>
            </div>
            <div className="who-card-4 reveal">
              <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--blue)', lineHeight: 1, marginBottom: 8 }}>AI</div>
              <div className="who-card-title">AI-Trained</div>
              <p className="who-card-desc">Every team member is trained in our AI Officer methodology before they join your team.</p>
            </div>
            <div className="who-card-4 reveal">
              <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--blue)', lineHeight: 1, marginBottom: 8 }}>Weeks</div>
              <div className="who-card-title">Start Fast</div>
              <p className="who-card-desc">Onboard your first team member in 2–4 weeks. No 6-month hiring cycles.</p>
            </div>
            <div className="who-card-4 reveal">
              <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--blue)', lineHeight: 1, marginBottom: 8 }}>Flex</div>
              <div className="who-card-title">Flexible Models</div>
              <p className="who-card-desc">Part-time, full-time, or project-based. Scale your team up or down as your needs evolve.</p>
            </div>
          </div>
        </div>
      </section>

      {/* THREE ROLES */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="section-label">The Roles</span>
            <h2 className="section-title">Specialized AI-Empowered Talent</h2>
          </div>
          <div className="choice-grid" style={{ marginTop: 48 }}>
            <div className="choice-card reveal">
              <div className="choice-label">Role 1</div>
              <div className="choice-role-title">AI Officers</div>
              <ul className="choice-role-bullets">
                <li>AI program design & management</li>
                <li>Process automation implementation</li>
                <li>Team AI training & coaching</li>
                <li>ROI measurement & reporting</li>
                <li>AI tools evaluation & selection</li>
              </ul>
            </div>
            <div className="choice-card featured reveal">
              <div className="choice-label">Role 2 · Most Requested</div>
              <div className="choice-role-title">AI Engineers</div>
              <ul className="choice-role-bullets">
                <li>Custom AI agent development</li>
                <li>CRM & workflow automation</li>
                <li>Data pipeline construction</li>
                <li>API integrations & connectors</li>
                <li>AI model fine-tuning & deployment</li>
              </ul>
            </div>
            <div className="choice-card reveal">
              <div className="choice-label">Role 3</div>
              <div className="choice-role-title">Marketing Professionals</div>
              <ul className="choice-role-bullets">
                <li>AI-powered content creation</li>
                <li>SEO & GEO optimization</li>
                <li>Social media management</li>
                <li>Email campaign automation</li>
                <li>Performance analytics & reporting</li>
              </ul>
            </div>
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
          <div className="testimonials-viewport" ref={viewportRefGS}>
            <div className="testimonials-track" ref={trackRefGS}>
              {extTestimonialsGS.map((t, i) => (
                <div key={i} className={`testimonial-card t-card-gs${i === activeExtIdxGS ? ' active' : ''}`}>
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
                <button key={i} className={`testimonials-dot${i === currentTestimonialGS ? ' active' : ''}`} onClick={() => scrollToTestimonialGS(i)} aria-label={`Go to testimonial ${i + 1}`} />
              ))}
            </div>
            <div className="testimonials-arrows">
              <button className="testimonials-arrow" onClick={() => scrollToTestimonialGS((currentTestimonialGS - 1 + T_COUNT_GS) % T_COUNT_GS)} aria-label="Previous">
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="testimonials-arrow" onClick={() => scrollToTestimonialGS((currentTestimonialGS + 1) % T_COUNT_GS)} aria-label="Next">
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
              <h2 className="section-title" style={{ marginBottom: 16 }}>Ready to Build Your AI-Ready Team?</h2>
              <p className="section-sub">Start with a free consultation to find the right global talent for your needs.</p>
            </div>
            <div className="contact-blue-cta reveal">
              <a href="/contact" className="btn btn-contact">Book a Conversation →</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
