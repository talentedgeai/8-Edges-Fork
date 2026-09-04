import Link from 'next/link'

export type Actor = 'ai' | 'human' | 'system' | 'contractor'

const ACTOR_LABELS: Record<Actor, string> = {
  ai: 'AI',
  human: 'Human',
  system: 'System',
  contractor: 'Contractor',
}

export function ActorChip({ actor, label }: { actor: Actor; label?: string }) {
  return <span className={`site-wf-actor wf-actor-${actor}`}>{label ?? ACTOR_LABELS[actor]}</span>
}

export function CategoryChip({ category }: { category: string }) {
  return <span className={`site-wf-cat wf-cat-${category.toLowerCase()}`}>{category}</span>
}

export function WorkflowHero({
  category,
  title,
  tldr,
  meta,
}: {
  category: string
  title: string
  tldr: string
  meta?: { label: string; value: string }[]
}) {
  return (
    <section className="site-wf-hero">
      <div className="container">
        <div className="site-wf-hero-inner">
          <div className="site-wf-breadcrumb">
            <Link href="/workflows">Workflows</Link>
            <span>/</span>
            <span>{category}</span>
          </div>
          <h1 className="site-section-title">{title}</h1>
          <p className="site-wf-hero-sub">{tldr}</p>
          {meta && meta.length > 0 && (
            <div className="site-wf-hero-meta">
              {meta.map((m) => (
                <span key={m.label} className="site-wf-meta-chip">
                  {m.label} <strong>{m.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export type RailStep = {
  num: string
  title: string
  cadence: string
  actor: Actor
  actorLabel?: string
}

export function FlowRail({ steps, repeatNote }: { steps: RailStep[]; repeatNote?: string }) {
  return (
    <div>
      <div className="site-wf-rail">
        {steps.map((s) => (
          <div key={s.num} className="site-wf-rail-step">
            <span className={`site-wf-rail-num wf-rail-num-${s.actor}`}>{s.num}</span>
            <span className="site-wf-rail-cadence">{s.cadence}</span>
            <div className="site-wf-rail-title">{s.title}</div>
            <ActorChip actor={s.actor} label={s.actorLabel} />
          </div>
        ))}
      </div>
      {repeatNote && (
        <div className="site-wf-rail-repeat">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11v-1a4 4 0 014-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v1a4 4 0 01-4 4H3" />
          </svg>
          {repeatNote}
        </div>
      )}
    </div>
  )
}

export type DetailStep = {
  num: string
  title: string
  cadence?: string
  actor: Actor
  actorLabel?: string
  body: React.ReactNode
}

export function StepCards({ steps }: { steps: DetailStep[] }) {
  return (
    <div className="site-wf-steps">
      {steps.map((s) => (
        <div key={s.num} className="site-wf-step">
          <div className="site-wf-step-num">{s.num}</div>
          <div>
            <div className="site-wf-step-head">
              <span className="site-wf-step-title">{s.title}</span>
              <ActorChip actor={s.actor} label={s.actorLabel} />
              {s.cadence && <span className="site-wf-step-cadence">{s.cadence}</span>}
            </div>
            <div className="site-wf-step-body">{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export type WorkflowElement = {
  name: string
  assignment: 'human' | 'machine' | 'both'
  desc: string
}

const ASSIGN_LABELS = { human: 'Human', machine: 'Machine', both: 'Both' } as const

export function ElementsGrid({ elements }: { elements: WorkflowElement[] }) {
  return (
    <div className="site-wf-elements">
      {elements.map((el, i) => (
        <div key={el.name} className="site-wf-element">
          <div className="site-wf-element-head">
            <span className="site-wf-element-name">
              {String(i + 1).padStart(2, '0')} {el.name}
            </span>
            <span className={`site-wf-assign wf-assign-${el.assignment}`}>{ASSIGN_LABELS[el.assignment]}</span>
          </div>
          <p className="site-wf-element-desc">{el.desc}</p>
        </div>
      ))}
    </div>
  )
}

export function SevenElements({ elements }: { elements: WorkflowElement[] }) {
  return (
    <>
      <span className="site-section-label">Workflow anatomy</span>
      <h2 className="site-section-title site-section-title--sm">
        The seven elements
      </h2>
      <p className="site-section-sub u-mt-3">
        Every workflow we document has the same anatomy: seven elements, each assigned to a human, a machine, or both.
        This is the Centaur Map from <Link href="/workflows/method">our workflow design method</Link>.
      </p>
      <ElementsGrid elements={elements} />
    </>
  )
}

export function DetailFooter() {
  return (
    <div className="site-wf-detail-foot">
      <Link href="/workflows" className="site-wf-back">
        ← All workflows
      </Link>
      <Link href="/workflows/method" className="site-wf-back">
        How we design workflows →
      </Link>
      <Link href="/contact" className="btn site-btn-secondary">
        Build this with Edge8 →
      </Link>
    </div>
  )
}
