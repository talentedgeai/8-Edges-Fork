'use client'

import { Card, Chip, Kpi } from '../bits'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

const TRENDS = [
  'Customers ask for an ETA text more than anything else',
  'Water heater jobs overrun when the old unit sits in a crawlspace',
  'Three ideas want the assistant to order parts, not just report',
]

export default function Innovation({ s, a }: { s: DemoState; a: DemoActions }) {
  const buildCount = s.ideas.filter((i) => i.kind === 'build').length
  return (
    <>
      <div className="e8d-kpis e8d-kpis--3">
        <Kpi label="Ideas" value={String(buildCount)} sub="open build ideas" />
        <Kpi label="Learning · 30d" value="6" sub="learnings logged" />
        <Kpi label="AI delivery mix" value="46%" sub="agent-run of 13 key results" />
      </div>
      <div className="e8d-two-col">
        <Card title="Idea backlog" aside={<span className="e8d-small">vote to prioritise</span>}>
          <form className="e8d-idea-add" onSubmit={(e) => { e.preventDefault(); a.addIdea() }}>
            <input
              className="e8d-input"
              placeholder="Log a build idea or a lesson from a job…"
              value={s.ideaDraft}
              onChange={(e) => a.setIdeaDraft(e.target.value)}
              aria-label="New idea"
            />
            <button type="submit" className="e8d-btn e8d-btn--primary" disabled={!s.ideaDraft.trim()}>Add</button>
          </form>
          <ul className="e8d-ideas">
            {s.ideas.map((id, i) => (
              <li key={id.title} className="e8d-idea">
                <button type="button" className={`e8d-vote${s.voted[i] ? ' e8d-vote--on' : ''}`} onClick={() => a.vote(i)} aria-pressed={!!s.voted[i]} aria-label={`Vote for ${id.title}`}>
                  ▲ {id.votes}
                </button>
                <div className="e8d-idea-main">
                  <div className="e8d-strong">{id.title}</div>
                  <div className="e8d-small">{id.by} · {id.office}</div>
                </div>
                <Chip status={id.kind}>{id.kind}</Chip>
              </li>
            ))}
          </ul>
        </Card>
        <div className="e8d-stack">
          <Card title="AI delivery mix" aside={<span className="e8d-small">who executes each key result</span>}>
            <div className="e8d-mix" role="img" aria-label="Human 7, blended 3, agent 3">
              <span className="e8d-mix-seg e8d-mix-seg--human" />
              <span className="e8d-mix-seg e8d-mix-seg--blended" />
              <span className="e8d-mix-seg e8d-mix-seg--agent" />
            </div>
            <div className="e8d-mix-legend">
              <Chip status="human">Human · 7</Chip>
              <Chip status="blended">Blended · 3</Chip>
              <Chip status="agent">Agent · 3</Chip>
            </div>
          </Card>
          <Card title="Trends across ideas" aside={<span className="e8d-small">AI summary, weekly</span>}>
            <ul className="e8d-trends">
              {TRENDS.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <div className="e8d-small">Updated today · idea-trends agent</div>
          </Card>
        </div>
      </div>
    </>
  )
}
