'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { allWorkflows } from '@/lib/workflowsData'

const ATTENDEES_FALLBACK = 645
const WORKFLOWS_FALLBACK = allWorkflows.length

const STATS = [
  {
    target: WORKFLOWS_FALLBACK,
    label: 'Documented Workflows',
    sub: 'AI workflows documented for our business and our clients, on the road to 100 in 2026',
    href: '/workflows',
  },
  {
    target: 16,
    label: 'Leadership Teams',
    sub: 'certified to run AI on their own',
    href: '/training-and-certification',
  },
  {
    target: 46,
    label: 'Applications Launched',
    sub: 'launched by 11 clients in the last 3 months',
    href: '/#case-studies',
  },
  {
    target: ATTENDEES_FALLBACK,
    label: 'Workshop Attendees',
    sub: 'on the road to 1,000 leaders trained in 2026',
  },
]

export default function HeroStats() {
  const [counts, setCounts] = useState(STATS.map(() => 0))
  const [visible, setVisible] = useState(false)
  const [attendees, setAttendees] = useState(ATTENDEES_FALLBACK)
  const [workflows, setWorkflows] = useState(WORKFLOWS_FALLBACK)
  const countsRef = useRef(counts)
  countsRef.current = counts
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (typeof d?.workshopAttendees === 'number' && d.workshopAttendees > 0) {
          setAttendees(d.workshopAttendees)
        }
        if (typeof d?.documentedWorkflows === 'number' && d.documentedWorkflows > 0) {
          setWorkflows(d.documentedWorkflows)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.4 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const targets = STATS.map((s, i) => (i === 0 ? workflows : i === 3 ? attendees : s.target))
    const from = countsRef.current
    const duration = 1800
    const start = Date.now()
    let raf = 0
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setCounts(targets.map((v, i) => Math.round(from[i] + (v - from[i]) * ease)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, attendees, workflows])

  return (
    <section className="site-hero-stats" aria-label="Edge8 program results to date" ref={ref}>
      <div className="container">
        <div className="site-hero-stats-grid">
          {STATS.map((stat, i) => {
            const body = (
              <>
                <div className="site-hero-stat-number">{counts[i]}</div>
                <div className="site-hero-stat-label">{stat.label}</div>
                <div className="site-hero-stat-sub">{stat.sub}</div>
              </>
            )
            return stat.href ? (
              <Link className="site-hero-stat reveal" key={stat.label} href={stat.href}>
                {body}
              </Link>
            ) : (
              <div className="site-hero-stat reveal" key={stat.label}>
                {body}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
