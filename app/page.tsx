'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import HeroStats from '@/components/HeroStats'

const testimonials = [
  {
    text: "I invited Dave to speak at the AI Summit in Sabah, and he was a natural on stage, bringing a fresh style the audience loved. We are looking forward to collaborating with the AI Officer Institute and Edge8 to bring their AI Certification Program to Malaysia and have signed an MOU to broaden the reach of our organization.",
    name: 'Dato George Lim',
    role: 'Founder & CEO, G&A GROUP & GA SPACE',
    avatar: '/homepage/images/home-page-testimonials-Dato.jpg',
  },
  {
    text: "We were lucky enough to have Dave Hajdu work with our forum to help understand how AI is automating tasks and exploding output across a wide range of applications. He was able to greatly expand our general knowledge of AI and demystify the challenges of implementation. I highly recommend Edge8.ai as a YPO resource.",
    name: 'John VanNewkirk',
    role: 'YPO Gold Seattle, Forum 6',
    avatar: '/homepage/images/home-page-testimonials-John.jpg',
  },
  {
    text: "I am very grateful to Dave Hajdu, who spoke to graduate students in our international business and public policy program during our visit to Vietnam about Negotiations and AI. He was extremely knowledgeable and engaging. Real-world experiences complemented our class discussions perfectly.",
    name: 'Dr. Brooks Holtom',
    role: 'Professor of Management, Georgetown',
    avatar: '/homepage/images/home-page-testimonials-Dr Holtom.jpg',
  },
  {
    text: "Love the new look and branding. The website looks so good. I'm deeply grateful. The brand interview really made me think about our positioning and business in ways I never expected.",
    name: 'Dao Nguyen',
    role: 'Founder, DN Legal',
    avatar: '/homepage/images/home-page-testimonials-Dao Nguyen.jpg',
  },
  {
    text: "I can't stop looking at the new website and brand book. With Edge8's help, we're finally presenting ourselves the way we've always wanted. The speed, the quality, and the care were all top-notch. Everything is just amazing. More than happy.",
    name: 'Tuan Anh Le',
    role: 'Managing Partner, DN Legal',
    avatar: '/homepage/images/home-page-testimonials-Tuan Anh.jpg',
  },
  {
    text: "Working with Edge8 has been a pleasure. When I launched Fab Four Academy, I needed support to build a strong brand and digital presence. Dave and the team stepped in and not only helped with the branding and digital presence, but showed us how to leverage AI to streamline our processes.",
    name: 'Dan Absher',
    role: 'CEO, Absher Construction Company',
    avatar: '/homepage/images/home-page-testimonials-Dan Absher.jpg',
  },
]

// Infinite carousel: 3 full copies — middle copy is "real", wrap-snap to middle when scrolling off edges
const T_COUNT = testimonials.length
const T_REAL_OFFSET = T_COUNT
const extTestimonials = [...testimonials, ...testimonials, ...testimonials]

// Video testimonials (YouTube). Order is shuffled on the client after mount so a
// different clip leads the slider on every refresh.
const videoTestimonials = [
  { id: 'jRwrSYlaO4Q', name: 'James Murray', caption: 'How I Build Multiple Projects in 1 Day' },
  { id: 'YSP6Xt0UEyk', name: 'Maureen Birdsall', caption: 'Infinite Leverage Stories' },
  { id: 'wlJNxiEbYVA', name: 'Tracy Angwin', caption: 'Private Retreat' },
]

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function HomePage() {
  const [activeExtIdx, setActiveExtIdx] = useState(T_REAL_OFFSET)
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSnappingRef = useRef(false)

  // Video testimonials: render source order on the server / first paint (so
  // hydration matches), then shuffle after mount to randomize the lead clip.
  const [videoOrder, setVideoOrder] = useState(videoTestimonials)
  useEffect(() => {
    setVideoOrder(shuffleArray(videoTestimonials))
  }, [])

  // currentTestimonial: real 0-(T_COUNT-1), derived from activeExtIdx
  const currentTestimonial = ((activeExtIdx - T_REAL_OFFSET) % T_COUNT + T_COUNT) % T_COUNT

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

  // Stats counter — animates on scroll into view
  // Testimonials scroll sync (infinite loop)
  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    const cards = track.querySelectorAll<HTMLElement>('.t-card-real')
    if (cards.length === 0) return

    const updateActive = () => {
      if (isSnappingRef.current) return
      const cx = viewport.scrollLeft + viewport.offsetWidth / 2
      let closest = 0, minDist = Infinity
      cards.forEach((card, i) => {
        const cardCx = card.offsetLeft + card.offsetWidth / 2
        const dist = Math.abs(cx - cardCx)
        if (dist < minDist) { minDist = dist; closest = i }
      })
      setActiveExtIdx(closest)

      // Snap from edge copies back to middle copy (invisible)
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
      const targetIdx = closest < T_COUNT ? closest + T_COUNT
        : closest >= T_COUNT * 2 ? closest - T_COUNT : -1
      if (targetIdx >= 0) {
        snapTimerRef.current = setTimeout(() => {
          const pad = parseFloat(track.style.paddingLeft || '0')
          isSnappingRef.current = true
          // Disable snap briefly so the jump is invisible
          viewport.style.scrollSnapType = 'none'
          viewport.scrollLeft = cards[targetIdx].offsetLeft - pad
          setActiveExtIdx(targetIdx)
          requestAnimationFrame(() => {
            viewport.style.scrollSnapType = ''
            requestAnimationFrame(() => { isSnappingRef.current = false })
          })
        }, 50)
      }
    }

    viewport.addEventListener('scroll', updateActive, { passive: true })

    const setEdgePadding = () => {
      if (!cards[T_REAL_OFFSET]) return
      const cardW = cards[T_REAL_OFFSET].offsetWidth
      const vw = viewport.offsetWidth
      const pad = Math.max(0, (vw - cardW) / 2)
      track.style.paddingLeft = `${pad}px`
      track.style.paddingRight = `${pad}px`
      viewport.scrollLeft = cards[T_REAL_OFFSET].offsetLeft - pad
    }
    setEdgePadding()

    return () => {
      viewport.removeEventListener('scroll', updateActive)
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    }
  }, [])

  const scrollToTestimonial = useCallback((realIdx: number) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    const cards = track.querySelectorAll<HTMLElement>('.t-card-real')
    const pad = parseFloat(track.style.paddingLeft || '0')

    // Always scroll to middle copy equivalent
    const extIdx = T_REAL_OFFSET + realIdx
    if (cards[extIdx]) {
      viewport.scrollTo({ left: cards[extIdx].offsetLeft - pad, behavior: 'smooth' })
    }
  }, [currentTestimonial])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormStatus('sending')
    setTimeout(() => {
      setFormStatus('sent')
      ;(e.target as HTMLFormElement).reset()
      setTimeout(() => setFormStatus('idle'), 3000)
    }, 1200)
  }

  return (
    <main>
      {/* ═══ HERO ═══════════════════════════════════════════ */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-eyebrow">Be Tech-Forward</div>
            <h1 className="hero-headline">
              It&apos;s Time to Stop Using AI<br />
              and Start <span className="accent">Leading It</span>
            </h1>
            <p className="hero-sub">
              Founders who <span className="accent">Lead AI</span> Build faster. Hire smarter. Ship more.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ HERO STATS STRIP ═══════════════════════════════ */}
      <HeroStats />

      {/* ═══ THE SHIFT ════════════════════════════════════════ */}
      <section className="shift section" id="shift">
        <div className="container">
          <div className="shift-header reveal">
            <span className="section-label">What Changes</span>
            <h2 className="section-title">What Happens When AI Agents Start Joining Your Team</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Adding ChatGPT to your tools is not the change. Hiring an AI agent that does a real job, every day, sitting next to your people, is the change. Here is what we have seen happen inside every company that crosses that line.
            </p>
          </div>
          <div className="shift-grid">
            <div className="shift-card reveal">
              <div className="shift-icon">
                <svg viewBox="0 0 24 24" fill="var(--color-primary-blue)" width="36" height="36"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              </div>
              <div className="shift-card-title">Leadership Has to Level Up</div>
              <p className="shift-card-desc">Managing humans is one skill. Orchestrating humans and AI agents is another. The leaders who adapt fastest become the most valuable people in the company. The ones who do not get routed around.</p>
            </div>
            <div className="shift-card reveal">
              <div className="shift-icon">
                <svg viewBox="0 0 24 24" fill="var(--color-primary-blue)" width="36" height="36"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/></svg>
              </div>
              <div className="shift-card-title">Everything Speeds Up</div>
              <p className="shift-card-desc">Cycles that took weeks compress into days. Days compress into hours. Meetings, reporting, planning, all of it has to be rebuilt for the new pace.</p>
            </div>
            <div className="shift-card reveal">
              <div className="shift-icon">
                <svg viewBox="0 0 24 24" fill="var(--color-primary-blue)" width="36" height="36"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              </div>
              <div className="shift-card-title">Hidden Mess Surfaces</div>
              <p className="shift-card-desc">AI agents do not tolerate the workarounds your team has been quietly carrying for years. Bad data, broken handoffs, undocumented processes, all of it gets exposed. The cleanup is the real work.</p>
            </div>
          </div>
          <div className="shift-payoff reveal">
            <div className="shift-payoff-eyebrow">And Then</div>
            <h3 className="shift-payoff-title">The magic happens.</h3>
            <p className="shift-payoff-body">Your people get their time back. They stop chasing inboxes and start building the things only humans can build. Innovation becomes the default, not the exception. The company grows with fewer hires, smaller teams, and bigger output. That is what Tech-Forward looks like.</p>
          </div>
        </div>
      </section>

      {/* ═══ WHY AI ═══════════════════════════════════════════ */}
      <section className="why-ai section" id="why">
        <div className="container">
          <div className="why-ai-inner">
            <div className="why-left reveal">
              <span className="section-label">The Problem</span>
              <h2 className="section-title">Why Do I Need an AI Program?</h2>
            </div>
            <div className="why-right reveal">
              <p><strong>Ad-hoc usage of AI is limiting you to minimal gains.</strong></p>
              <p style={{ marginTop: 16 }}>Lack of focus traps your business in mediocrity, keeping you stuck in repetitive tasks, wasted resources, and missed opportunities. Without a structured AI Program, competitors will outpace you, innovation stalls, costs balloon, and growth suffers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PHOTO GALLERY ════════════════════════════════════ */}
      <div className="photo-gallery">
        <div className="photo-gallery-track">
          {[1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
            <div key={i} className="photo-gallery-slide">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/homepage/images/${n}.jpg`} alt={`Edge8 ${n}`} />
            </div>
          ))}
        </div>
      </div>

{/* ═══ TESTIMONIALS ═══════════════════════════════════ */}
      <section className="testimonials section" id="testimonials">
        <div className="container">
          <div className="testimonials-header reveal">
            <span className="section-label">Testimonials</span>
            <h2 className="section-title">Trusted by Leaders Worldwide</h2>
          </div>
        </div>
        <div className="container" style={{ overflow: 'visible' }}>
          <div className="testimonials-viewport" ref={viewportRef}>
            <div className="testimonials-track" ref={trackRef}>
              {extTestimonials.map((t, i) => (
                <div
                  key={i}
                  className={`testimonial-card t-card-real${i === activeExtIdx ? ' active' : ''}`}
                >
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
                <button
                  key={i}
                  className={`testimonials-dot${i === currentTestimonial ? ' active' : ''}`}
                  onClick={() => scrollToTestimonial(i)}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>
            <div className="testimonials-arrows">
              <button
                className="testimonials-arrow"
                id="testimonialPrev"
                aria-label="Previous"
                onClick={() => scrollToTestimonial((currentTestimonial - 1 + T_COUNT) % T_COUNT)}
              >
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                className="testimonials-arrow"
                id="testimonialNext"
                aria-label="Next"
                onClick={() => scrollToTestimonial((currentTestimonial + 1) % T_COUNT)}
              >
                <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
              </button>
            </div>
          </div>
          {/* ─── YouTube video slider ─── */}
          <div className="yt-slider-wrap">
            <div className="yt-viewport">
              <div className="yt-track">
                {videoOrder.map(v => (
                  <div key={v.id} className="yt-card">
                    <iframe src={`https://www.youtube.com/embed/${v.id}`} title={`${v.name} — ${v.caption}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" className="yt-iframe" />
                    <div className="yt-caption">
                      <span className="yt-name">{v.name}</span>
                      <span className="yt-role">{v.caption}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="yt-nav">
              <button className="testimonials-arrow" aria-label="Previous" onClick={() => { const v = document.querySelector('.yt-viewport') as HTMLElement; v?.scrollBy({ left: -440, behavior: 'smooth' }) }}>
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="testimonials-arrow" aria-label="Next" onClick={() => { const v = document.querySelector('.yt-viewport') as HTMLElement; v?.scrollBy({ left: 440, behavior: 'smooth' }) }}>
                <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PARTNERS ════════════════════════════════════ */}
      <PartnerMarquee />

      {/* ═══ CORE SOLUTIONS ══════════════════════════════ */}
      <section className="solutions section" id="solutions">
        <div className="container">
          <div className="solutions-header reveal">
            <span className="section-label">Core Solutions</span>
            <h2 className="section-title">We Empower Founders to <span className="accent">Lead AI</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>Empowering Organizations to use AI effectively through clear leadership, thoughtful implementation and strong global talent.</p>
          </div>
          <div className="solutions-rows">
            {/* Row 1: image left, text right */}
            <div className="solution-row reveal">
              <div className="solution-row-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/homepage/images/home-page-solutions-teams.jpg" alt="Lead AI Agent Teams" />
              </div>
              <div className="solution-row-text">
                <span className="solution-row-label">AI Agent Teams</span>
                <h3 className="solution-row-title">Lead AI Agent Teams</h3>
                <p className="solution-row-desc">We design, build, and deploy the AI agents that take repetitive work off your team. You become the manager of a workforce that does not sleep, does not forget, and does not quit.</p>
                <a href="/ai-programs" className="solution-row-link">Learn more →</a>
              </div>
            </div>
            {/* Row 2: text left, image right */}
            <div className="solution-row solution-row--reverse reveal">
              <div className="solution-row-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/homepage/images/home-page-solutions-global-talent.jpg" alt="Hire AI-Trained Global Talent" />
              </div>
              <div className="solution-row-text">
                <span className="solution-row-label">Global Talent Network</span>
                <h3 className="solution-row-title">Hire AI-Trained Global Talent</h3>
                <p className="solution-row-desc">AI-trained engineers in Vietnam at 75% less than US rates, deployed in 3 weeks. AI Officers, Engineers, and Marketing Professionals — flexible models, immediate impact.</p>
                <a href="/global-staffing" className="solution-row-link">Learn more →</a>
              </div>
            </div>
            {/* Row 3: image left, text right */}
            <div className="solution-row reveal">
              <div className="solution-row-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/homepage/images/home-page-solutions-network-2.jpg" alt="Private AI Build Retreats in Saigon" />
              </div>
              <div className="solution-row-text">
                <span className="solution-row-label">Private Retreats</span>
                <h3 className="solution-row-title">Build in Saigon. Ship in Days.</h3>
                <p className="solution-row-desc">Bring your team to Saigon for a fully private AI build retreat. Ship real apps, deploy AI agents, and leave with capabilities — not decks. Fully private, fully hands-on.</p>
                <a href="/saigon-private" className="solution-row-link">Learn more →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ AI PROGRAMS ════════════════════════════════ */}
      <section className="case-studies section" id="case-studies">
        <div className="container">
          <div className="case-studies-header reveal">
            <div>
              <span className="section-label">AI Programs</span>
              <h2 className="section-title">Businesses who have learned to <span className="accent">Lead AI</span> as a part of their teams</h2>
            </div>
            <Link href="/ai-programs" className="text-link">Full List of AI Programs →</Link>
          </div>
          <div className="case-studies-grid">
            <Link href="/case-studies/kyungbang-ai-program" className="case-card reveal">
              <Image src="/case studies/images/case studies-ai programs-Kyungbang.jpeg" alt="Kyungbang" width={400} height={533} />
              <div className="case-overlay">
                <span className="case-tag">Manufacturing</span>
                <div className="case-name">Kyungbang</div>
              </div>
            </Link>
            <Link href="/case-studies/veracity-ai-program" className="case-card reveal">
              <Image src="/case studies/images/case studies-ai programs-Veracity.jpeg" alt="Veracity" width={400} height={533} />
              <div className="case-overlay">
                <span className="case-tag">AI Agents</span>
                <div className="case-name">Veracity</div>
              </div>
            </Link>
            <Link href="/case-studies/wink-hotels-travel-buddy" className="case-card reveal">
              <Image src="/case studies/images/case studies-ai programs-Wink Hotels (Travel Buddy).jpeg" alt="Wink Hotels" width={400} height={533} />
              <div className="case-overlay">
                <span className="case-tag">AI Concierge</span>
                <div className="case-name">Wink Hotels</div>
              </div>
            </Link>
          </div>
          <div style={{ textAlign: 'center', marginTop: 48 }} className="reveal">
            <Link href="/ai-programs" className="btn btn-primary">View Our Success Case Studies</Link>
          </div>
        </div>
      </section>

      {/* ═══ MENTAL MODELS ════════════════════════════════ */}
      <section className="mental section" id="mental">
        <div className="container">
          <div className="mental-header reveal">
            <span className="section-label mental-label">Mental Models</span>
            <h2 className="section-title mental-title">How We Think About Building With AI</h2>
            <p className="section-sub mental-sub">Two ideas shape how we design every engagement. They are how we differ from the consultants who just talk about AI.</p>
          </div>
          <div className="mental-grid">
            <div className="mental-card reveal">
              <div className="mental-tag">Mental Model 01</div>
              <div className="mental-claim">The Folder Is the Agent.</div>
              <p className="mental-body">We obsess over the Claude environment. How agents and sub-agents are structured. How information is organized. How workflows are designed. What guardrails are in place. When the structure is right, the agent is right. When the structure is wrong, no prompt can save you. Most companies try to bolt AI onto chaos. We help you build the structure first, so the agent has somewhere to stand.</p>
            </div>
            <div className="mental-card reveal">
              <div className="mental-tag">Mental Model 02</div>
              <div className="mental-claim">CMS Is Dead. Claude Is the CMS.</div>
              <p className="mental-body">Stop building inside the CMS. Start building inside the AI. For twenty years your content, your workflows, your knowledge sat trapped inside whatever CMS you happened to license. Every change required a developer. Every new use case required a new tool. We flip the relationship. Claude becomes the system of record, the content engine, and the workflow runner. The website is just the output. Your team stops working inside the tool and starts operating above it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BLOG ════════════════════════════════════════ */}
      <section className="blog section" id="blog">
        <div className="container">
          <div className="blog-header reveal">
            <div>
              <span className="section-label">Insights</span>
              <h2 className="section-title">AI Is Driving Rapid Change</h2>
            </div>
            <Link href="/blog" className="text-link">View All Posts →</Link>
          </div>
          <div className="blog-layout">
            <Link href="/post/the-other-50-percent-of-leadership" className="blog-featured reveal">
              <div className="blog-featured-visual">
                <Image src="/blog/images/the-other-50-percent-of-leadership.webp" alt="The Other 50% of Leadership" width={600} height={338} />
              </div>
              <div className="blog-featured-body">
                <h3 className="blog-featured-title">The Other 50% of Leadership</h3>
                <p className="blog-excerpt">AI-era leadership now needs a second skill set: workflow design, information architecture, and writing instructions for AI. Here is how to build it.</p>
                <span className="blog-more">Read Article →</span>
              </div>
            </Link>
            <div className="blog-stack">
              <Link href="/post/ai-program-vs-ai-tool" className="blog-item reveal">
                <Image src="/blog/images/ai-program-vs-ai-tool.webp" alt="AI Program vs AI Tool" width={80} height={80} className="blog-item-thumb" />
                <div className="blog-item-body">
                  <h4 className="blog-item-title">AI Program vs AI Tool: I Built a Real One, and the Number Stung</h4>
                  <p className="blog-item-excerpt">Most companies buy AI tools when they need an AI program built on their own data.</p>
                </div>
                <span className="blog-item-arrow">→</span>
              </Link>
              <Link href="/post/why-grok-4-s-success-proves-strategic-ai-planning-beats-first-mover-advantage" className="blog-item reveal">
                <Image src="/blog/images/why-grok-4-s-success-proves-strategic-ai-planning-beats-first-mover-advantage.webp" alt="Why Grok 4's Success Proves Strategic AI Planning Beats First-Mover Advantage" width={80} height={80} className="blog-item-thumb" />
                <div className="blog-item-body">
                  <h4 className="blog-item-title">Why Grok 4&apos;s Success Proves Strategic AI Planning Beats First-Mover Advantage</h4>
                  <p className="blog-item-excerpt">Grok 4&apos;s breakthrough validates a fundamental principle: strategic patience beats early market entry.</p>
                </div>
                <span className="blog-item-arrow">→</span>
              </Link>
              <Link href="/post/elon-musk-twitter-data-strategy-ai-play" className="blog-item reveal">
                <Image src="/blog/images/elon-musk-twitter-data-strategy-ai-play.jpeg" alt="Elon Musk's Twitter Data Strategy: AI Lessons for Leaders" width={80} height={80} className="blog-item-thumb" />
                <div className="blog-item-body">
                  <h4 className="blog-item-title">Elon Musk&apos;s Twitter Data Strategy: AI Lessons for Leaders</h4>
                  <p className="blog-item-excerpt">Musk didn&apos;t buy a social platform. He bought the world&apos;s largest human-curated index of the web.</p>
                </div>
                <span className="blog-item-arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW TO ENGAGE ═══════════════════════════════ */}
      <section className="engage section" id="engage">
        <div className="container">
          <div className="engage-header reveal">
            <span className="section-label">Engagement</span>
            <h2 className="section-title">How to Engage With Us</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>Three ways to work with us. One pricing model. Transparent reporting every Friday.</p>
          </div>
          <div className="engage-grid">
            <div className="engage-card reveal">
              <div className="engage-tag">Coach</div>
              <div className="engage-title">Tell You How to Do It</div>
              <p className="engage-desc">We map your highest-ROI AI use case, design the system, and hand you the blueprint. Your team builds it. We answer questions when they get stuck.</p>
              <div className="engage-fit"><strong>Best for:</strong> teams with strong engineers who need direction, not labor.</div>
            </div>
            <div className="engage-card featured reveal">
              <div className="engage-tag">Co-Build &middot; Most Popular</div>
              <div className="engage-title">Do It With You</div>
              <p className="engage-desc">We sit next to your team in the same repo, the same Slack, the same standup. You ship faster, and you keep the muscle in-house when we leave.</p>
              <div className="engage-fit"><strong>Best for:</strong> founders who want to build the muscle while the work gets done.</div>
            </div>
            <div className="engage-card reveal">
              <div className="engage-tag">Build</div>
              <div className="engage-title">Do It For You</div>
              <p className="engage-desc">We design, build, and run the AI program end to end. You stay focused on customers and revenue. We hand you the keys when it is shipped and working.</p>
              <div className="engage-fit"><strong>Best for:</strong> founders who need it shipped. Yesterday.</div>
            </div>
          </div>

          <div className="engage-pricing reveal">
            <div className="engage-pricing-header">
              <span className="section-label">Pricing</span>
              <h3 className="engage-pricing-title">Simple. By the day, then by the hour.</h3>
            </div>
            <div className="engage-pricing-grid">
              <Link href="/saigon-private" className="engage-price engage-price--link">
                <div className="engage-price-num">$1,000</div>
                <div className="engage-price-unit">per day</div>
                <div className="engage-price-desc">Sprints run 3, 4, or 5 days. Pick the length that fits the scope. $3,000 to $5,000 total.</div>
              </Link>
              <div className="engage-price">
                <div className="engage-price-num">$2,000</div>
                <div className="engage-price-unit">= 40 human tokens</div>
                <div className="engage-price-desc">After the sprint, buy a token pack when you need ongoing support. 1 human token = 1 hour of human work.</div>
              </div>
            </div>

            <div className="engage-transparency">
              <div className="engage-transparency-eyebrow">Every Friday you see</div>
              <div className="engage-transparency-list">
                <div className="engage-transparency-item"><strong>Pull Requests Shipped</strong><span>Every change pushed to your codebase.</span></div>
                <div className="engage-transparency-item"><strong>Claude Tokens Used</strong><span>Exact AI compute consumed on your work.</span></div>
                <div className="engage-transparency-item"><strong>Human Tokens Spent</strong><span>Exact hours your team paid for.</span></div>
              </div>
              <p className="engage-transparency-line">No mystery invoices. No surprise bills. The same transparency we ask of our AI agents, we hold ourselves to.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WHY CLAUDE ═══════════════════════════════════ */}
      <section className="claude section" id="claude">
        <div className="container">
          <div className="claude-header reveal">
            <span className="section-label">We Chose One</span>
            <h2 className="section-title">Stop Chasing Tools. We Did.</h2>
            <p className="section-sub" style={{ marginTop: 16 }}>You can spend all your time chasing models, framing it as research, and stay stuck on the hamster wheel. Just like you probably are right now. We chose Claude. We built our entire ecosystem around it. We have not looked back. Same stack on every client engagement. Same transparency every week: Claude tokens, human tokens, and every pull request tracked in GitHub.</p>
          </div>

          <div className="claude-stack reveal">
            <span className="claude-stack-chip">Claude Code</span>
            <span className="claude-stack-chip">Claude Co-Work</span>
            <span className="claude-stack-chip">Team Accounts</span>
            <span className="claude-stack-chip">Shared Projects</span>
            <span className="claude-stack-chip">Claude Tokens</span>
          </div>

          <div className="claude-grid">
            <div className="claude-card reveal">
              <div className="claude-card-num">01</div>
              <div className="claude-card-title">It writes production code without babysitting.</div>
              <p className="claude-card-body">We tested everything. GPT, Gemini, the open-source flavor of the month. Claude is the only model that ships features we can put in front of clients without rewriting. Stop comparing benchmarks. Open Claude Code. Watch what happens.</p>
            </div>
            <div className="claude-card reveal">
              <div className="claude-card-num">02</div>
              <div className="claude-card-title">It tells you when it does not know.</div>
              <p className="claude-card-body">Every other model lies to your face with full confidence. Claude refuses to make things up. That one trait has saved us from a hundred client embarrassments. Every benchmark on a leaderboard is downstream of this one behavior.</p>
            </div>
            <div className="claude-card reveal">
              <div className="claude-card-num">03</div>
              <div className="claude-card-title">Anthropic does not ship to chase headlines.</div>
              <p className="claude-card-body">Most labs push a new model every 8 weeks and break everything you built. Anthropic ships when the work is done. The agent we shipped six months ago still runs the same way today. That is the difference between a vendor and a platform.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CONTACT — TYPEFORM ══════════════════════════ */}
      <section className="contact-blue section" id="contact">
        <div className="container">
          <div className="contact-blue-inner">
            <div className="reveal">
              <h2 className="section-title" style={{ marginBottom: 16 }}>Let&apos;s Lead AI Together</h2>
              <p className="section-sub">Book a 30-minute call. We will talk through your business and email you your first AI Program plan within 88 minutes. Free, no pitch.</p>
            </div>
            <div className="contact-blue-cta reveal">
              <a href="/contact" className="btn btn-contact">
                Book a Conversation
              </a>
            </div>
          </div>
        </div>
      </section>

    </main>
  )
}

const partnerLogos = [
  { src: '/homepage/images/home-page-partners-PHO24.png', alt: 'PHO24' },
  { src: '/homepage/images/home-page-partners-veracity.png', alt: 'Veracity' },
  { src: '/homepage/images/home-page-partners-vespa.png', alt: 'Vespa Adventures' },
  { src: '/homepage/images/home-page-partners-EO.png', alt: 'EO' },
  { src: '/homepage/images/home-page-partners-unlock venture partners.png', alt: 'Unlock Venture Partners' },
  { src: '/homepage/images/home-page-partners-investmigrate.png', alt: 'InvestMigrate' },
  { src: '/homepage/images/home-page-partners-abound health group.png', alt: 'Abound Health Group' },
]

function PartnerMarquee() {
  const doubled = [...partnerLogos, ...partnerLogos]
  return (
    <section className="partners">
      <div className="partners-viewport">
        <div className="partners-track">
          {doubled.map((logo, i) => (
            <Image key={i} src={logo.src} alt={logo.alt} width={130} height={36} className="partner-logo" />
          ))}
        </div>
      </div>
    </section>
  )
}
