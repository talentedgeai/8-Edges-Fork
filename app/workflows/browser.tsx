'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Workflow } from '@/lib/workflowsData'
import { CategoryChip } from './ui'

const OFFICE_ORDER = ['Revenue', 'Talent', 'Operations', 'Innovation'] as const

const OFFICE_TAGLINES: Record<(typeof OFFICE_ORDER)[number], string> = {
  Revenue: 'How money gets made, invoiced, and reconciled.',
  Talent: 'How people get hired, coached, and grown.',
  Operations: 'How the machine runs day to day.',
  Innovation: 'How ideas become plans and skills become proof.',
}

type View = 'offices' | 'newest' | 'alphabetical'

const VIEWS: { key: View; label: string }[] = [
  { key: 'offices', label: 'Four Offices' },
  { key: 'newest', label: 'Newest' },
  { key: 'alphabetical', label: 'Alphabetical' },
]

type Layout = 'card' | 'list'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function WorkflowCard({ w }: { w: Workflow }) {
  return (
    <Link href={`/workflows/${w.slug}`} className="wf-card">
      <div className="wf-card-top">
        <CategoryChip category={w.category} />
        <span className="wf-card-date">{formatDate(w.date)}</span>
      </div>
      <h3 className="wf-card-title">{w.title}</h3>
      <p className="wf-card-excerpt">{w.excerpt}</p>
      <div className="wf-card-foot">
        <span className="wf-card-steps">{w.steps} steps</span>
        <span className="wf-card-read">View workflow →</span>
      </div>
    </Link>
  )
}

function WorkflowRow({ w }: { w: Workflow }) {
  return (
    <Link href={`/workflows/${w.slug}`} className="wf-row">
      <CategoryChip category={w.category} />
      <span className="wf-row-title">{w.title}</span>
      <span className="wf-row-steps">{w.steps} steps</span>
      <span className="wf-row-date">{formatDate(w.date)}</span>
      <span className="wf-row-arrow">→</span>
    </Link>
  )
}

function WorkflowSet({ workflows, layout }: { workflows: Workflow[]; layout: Layout }) {
  if (layout === 'list') {
    return (
      <div className="wf-list">
        {workflows.map((w) => (
          <WorkflowRow key={w.slug} w={w} />
        ))}
      </div>
    )
  }
  return (
    <div className="wf-grid">
      {workflows.map((w) => (
        <WorkflowCard key={w.slug} w={w} />
      ))}
    </div>
  )
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

export default function WorkflowsBrowser({ workflows }: { workflows: Workflow[] }) {
  const [view, setView] = useState<View>('offices')
  const [layout, setLayout] = useState<Layout>('card')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      workflows.filter(
        (w) =>
          q === '' ||
          w.title.toLowerCase().includes(q) ||
          w.excerpt.toLowerCase().includes(q) ||
          w.category.toLowerCase().includes(q),
      ),
    [workflows, q],
  )

  const sorted = useMemo(() => {
    if (view === 'newest') return [...matches].sort((a, b) => b.date.localeCompare(a.date))
    return [...matches].sort((a, b) => a.title.localeCompare(b.title))
  }, [matches, view])

  const visibleOffices = OFFICE_ORDER.map((office) => ({
    office,
    workflows: matches.filter((w) => w.category === office),
  })).filter((g) => g.workflows.length > 0)

  return (
    <>
      <section className="u-pt-7">
        <div className="container">
          <div className="wf-controls">
            <div className="wf-views" role="tablist" aria-label="View workflows by">
              <span className="wf-views-label">View by</span>
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={view === v.key}
                  className={`wf-view-tab${view === v.key ? ' active' : ''}`}
                  onClick={() => setView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="wf-controls-right">
              <input
                type="search"
                className="wf-search"
                placeholder="Search workflows…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search workflows"
              />
              <div className="wf-layouts" role="group" aria-label="Layout">
                <button
                  className={`wf-layout-btn${layout === 'card' ? ' active' : ''}`}
                  aria-label="Card view"
                  aria-pressed={layout === 'card'}
                  onClick={() => setLayout('card')}
                >
                  <CardIcon />
                </button>
                <button
                  className={`wf-layout-btn${layout === 'list' ? ' active' : ''}`}
                  aria-label="List view"
                  aria-pressed={layout === 'list'}
                  onClick={() => setLayout('list')}
                >
                  <ListIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {matches.length === 0 ? (
        <section className="u-pt-8 u-pb-9">
          <div className="container">
            <p className="wf-empty">No workflows match &ldquo;{query}&rdquo;. Try a different word, or clear the search.</p>
          </div>
        </section>
      ) : view === 'offices' ? (
        visibleOffices.map(({ office, workflows: officeWorkflows }, i) => (
          <section
            key={office}
            className={`section wf-band${i % 2 === 1 ? " wf-band--tint" : ""}`}
          >
            <div className="container">
              <span className="site-section-label" style={i % 2 === 1 ? { background: 'var(--white)' } : undefined}>
                {office} office
              </span>
              <h2 className="site-section-title wf-title-lg u-mb-2">
                {office}
              </h2>
              <p className="site-section-sub u-mb-6">
                {OFFICE_TAGLINES[office]}
              </p>
              <WorkflowSet workflows={officeWorkflows} layout={layout} />
            </div>
          </section>
        ))
      ) : (
        <section className="section u-pt-8 u-pb-9">
          <div className="container">
            <WorkflowSet workflows={sorted} layout={layout} />
          </div>
        </section>
      )}
    </>
  )
}
