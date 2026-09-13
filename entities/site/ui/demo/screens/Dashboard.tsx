'use client'

import { Avatar, Card, Chip, Kpi } from '../bits'
import { initials, usd } from '../data'
import type { DemoActions } from '../useDemo'
import { ago } from '../useDemo'
import type { DemoState } from '../types'

export default function Dashboard({ s, a }: { s: DemoState; a: DemoActions }) {
  const pending = s.requests.filter((r) => r.status === 'requested').length
  const overdue = s.invoices.filter((i) => i.status === 'overdue')
  const overdueSum = overdue.reduce((n, i) => n + i.amount, 0)
  const open = s.deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost')
  const pipe = open.reduce((n, d) => n + d.amount, 0)
  const onSite = s.jobs.filter((j) => j.col === 'in_progress')
  const year = new Date().getFullYear()

  const offices = [
    { label: 'Revenue', page: 'goals' as const, o: s.krs[0],
      stats: [['YTD', '$1.67M', `${year} to date`], ['Commercial share', `${s.krs[0].krs[0].cur}%`, 'target 35%'], ['In queue', String(s.leads.length), `${s.leads.filter((l) => l.slaMins < 0).length} past SLA`]] },
    { label: 'Talent', page: 'goals' as const, o: s.krs[2],
      stats: [['Open roles', '2', 'plumbers'], ['Applications', '23', '+31% · 30d'], ['Ride-alongs', String(s.candidates.filter((c) => c.stage === 'Ride-Along' || c.stage === 'Offer').length), 'this week']] },
    { label: 'Operations', page: 'dispatch' as const, o: s.krs[1],
      stats: [['Vans on site', String(onSite.length), `${s.jobs.filter((j) => j.col === 'scheduled').length} scheduled`], ['Overdue', usd(overdueSum), `${overdue.length} invoices`], ['Leave pending', String(pending), 'need a decision']] },
    { label: 'Innovation', page: 'agents' as const, o: s.krs[3],
      stats: [['Ideas', String(s.ideas.filter((i) => i.kind === 'build').length), 'open build ideas'], ['Lessons', String(s.ideas.filter((i) => i.kind === 'learning').length), 'logged · 30d'], ['AI mix', `${s.krs[3].krs[0].cur}%`, 'agent-run KRs']] },
  ]

  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="Revenue · 30d" value="$212,400" sub="service $164k · contracts $48k" onClick={() => a.go('dispatch')} />
        <Kpi label="Open quotes" value={usd(pipe)} sub={`${open.length} open deals`} onClick={() => a.go('goals')} />
        <Kpi label="Headcount" value="7" sub={`${s.candidates.filter((c) => c.stage !== 'Hired').length} candidates in pool`} onClick={() => a.go('goals')} />
        <Kpi label="Needs a decision" value={String(pending + overdue.length)} sub={`${pending} leave · ${overdue.length} overdue invoices`} onClick={() => a.go('agents')} />
      </div>

      <div className="e8d-offices">
        {offices.map((o) => (
          <Card key={o.label} className="e8d-office"
            title={<><span className={`e8d-dot e8d-dot--${o.label.toLowerCase()}`} aria-hidden />{o.label}</>}
            aside={<><Chip status={o.o.health}>{o.o.health}</Chip><button type="button" className="e8d-link" onClick={() => a.go(o.page)}>Cockpit →</button></>}>
            <div className="e8d-small e8d-office-obj">{o.o.title}</div>
            <div className="e8d-office-stats">
              {o.stats.map(([label, value, sub]) => (
                <div key={label}>
                  <div className="e8d-kpi-label">{label}</div>
                  <div className="e8d-office-value">{value}</div>
                  <div className="e8d-kpi-sub">{sub}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="e8d-two-col">
        <Card title="On site right now" aside={<button type="button" className="e8d-link" onClick={() => a.go('dispatch')}>Service Dispatch →</button>}>
          <ul className="e8d-onsite">
            {onSite.map((j) => (
              <li key={j.id}>
                <Avatar who={initials(j.plumber)} />
                <div>
                  <div className="e8d-strong">{j.plumber} · {j.customer}</div>
                  <div className="e8d-small">{j.title} · since {j.when}</div>
                </div>
              </li>
            ))}
            {!onSite.length && <li className="e8d-small">No vans on site. {s.jobs.filter((j) => j.col === 'scheduled').length} jobs scheduled.</li>}
          </ul>
        </Card>
        <Card title="Live activity" aside={<span className="e8d-small">people + agents, same database</span>}>
          <ul className="e8d-feed">
            {s.feed.map((fe, i) => (
              <li key={`${fe.text}-${i}`} className="e8d-feed-item">
                <Avatar who={fe.who} agent={fe.agent} />
                <div>
                  <div className="e8d-feed-text">{fe.text}</div>
                  <div className="e8d-kpi-sub">{ago(fe.at, fe.when)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
