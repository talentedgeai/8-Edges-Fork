'use client'

import { Avatar, Card, Chip } from '../bits'
import { initials, PEOPLE, SERVICES, STRATEGY, VALUES } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

// Where the story starts: the one-page strategy, the values it rests on, and
// the objectives that turn it into owned numbers. Everything below is what the
// rest of the tour executes against.
export default function Strategy({ s, a }: { s: DemoState; a: DemoActions }) {
  const lead = PEOPLE[0], dispatcher = PEOPLE[1], master = PEOPLE[2]
  const crew = PEOPLE.slice(3)
  return (
    <>
      <div className="e8d-strategy">
        <Card className="e8d-strategy-card">
          <div className="e8d-kpi-label">{STRATEGY.year} strategy</div>
          <h4 className="e8d-strategy-title">{STRATEGY.title}</h4>
          <p className="e8d-strategy-body">{STRATEGY.body}</p>
          <div className="e8d-services">
            {SERVICES.map((sv) => <span key={sv} className="e8d-service">{sv}</span>)}
          </div>
        </Card>
        <Card title="Core values" aside={<span className="e8d-small">what the crew is measured on</span>}>
          <ul className="e8d-values">
            {VALUES.map((v) => (
              <li key={v.title}>
                <div className="e8d-strong">{v.title}</div>
                <div className="e8d-small">{v.body}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="This quarter's objectives" aside={<button type="button" className="e8d-link" onClick={() => a.setPage('goals')}>Open Company Goals →</button>}>
        <ul className="e8d-objective-list">
          {s.krs.map((o) => (
            <li key={o.office} className="e8d-objective-row">
              <span className={`e8d-dot e8d-dot--${o.office.toLowerCase()}`} aria-hidden />
              <span className="e8d-objective-office">{o.office}</span>
              <span className="e8d-objective-text">{o.title}</span>
              <span className="e8d-objective-owners">
                {o.krs.map((k) => <span key={k.title} title={`${k.title} · ${k.ownerTitle}`}><Avatar who={k.owner} agent={k.owner === 'AG'} /></span>)}
              </span>
              <Chip status={o.health}>{o.health}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Org chart" aside={<span className="e8d-small">7 people · 5 vans · Seattle, Bellevue, Renton</span>}>
        <div className="e8d-org">
          <div className="e8d-org-node e8d-org-node--root">
            <Avatar who={initials(lead.name)} />
            <div><div className="e8d-strong">{lead.name}</div><div className="e8d-small">{lead.role}</div></div>
          </div>
          <div className="e8d-org-row">
            <div className="e8d-org-node">
              <Avatar who={initials(dispatcher.name)} />
              <div><div className="e8d-strong">{dispatcher.name}</div><div className="e8d-small">{dispatcher.role}</div></div>
            </div>
            <div className="e8d-org-node">
              <Avatar who={initials(master.name)} />
              <div><div className="e8d-strong">{master.name}</div><div className="e8d-small">{master.role}</div></div>
            </div>
          </div>
          <div className="e8d-org-row e8d-org-row--crew">
            {crew.map((p) => (
              <div key={p.name} className="e8d-org-node e8d-org-node--sm">
                <Avatar who={initials(p.name)} />
                <div><div className="e8d-strong">{p.name}</div><div className="e8d-small">{p.role}{p.stage === 'Probation' ? ' · probation' : ''}</div></div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  )
}
