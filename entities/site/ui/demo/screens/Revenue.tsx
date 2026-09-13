'use client'

import { Card, Chip, Kpi, Table } from '../bits'
import { usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

export function Deals({ s, a }: { s: DemoState; a: DemoActions }) {
  const open = s.deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost')
  const pipe = open.reduce((n, d) => n + d.amount, 0)
  return (
    <>
      <div className="e8d-kpis e8d-kpis--3">
        <Kpi label="Open pipeline" value={usd(pipe)} sub={`${open.length} open · weighted ${usd(Math.round((pipe * 0.52) / 100) * 100)}`} />
        <Kpi label="Won · this quarter" value="$96,400" sub="7 jobs · 24% of quotes" />
        <Kpi label="Avg. cycle" value="19 days" sub="quote → signed" />
      </div>
      <Card>
        <Table head={['Deal', 'Company', 'Stage', 'Amount', 'Owner', 'Close']}>
          {s.deals.map((d, i) => (
            <tr key={`${d.company}-${d.name}`} className={`e8d-row e8d-row--link${s.drawer === i ? ' e8d-row--active' : ''}`} onClick={() => a.openDrawer(i)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.openDrawer(i) } }}>
              <td className="e8d-strong">{d.name}</td>
              <td>{d.company}</td>
              <td><Chip status={d.stage}>{d.stage}</Chip></td>
              <td className="e8d-num">{d.amount ? usd(d.amount) : '—'}</td>
              <td>{d.owner}</td>
              <td>{d.close}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}

function slaLabel(mins: number) {
  const over = mins < 0, m = Math.abs(mins)
  if (over) return { text: `SLA overdue ${m >= 60 ? Math.floor(m / 60) + 'h' : m + 'm'}`, tone: 'err' as const }
  if (m < 60) return { text: `Respond in ${m}m`, tone: 'err' as const }
  return { text: `Respond in ${Math.round(m / 60)}h`, tone: 'warn' as const }
}

export function Leads({ s, a }: { s: DemoState; a: DemoActions }) {
  if (s.leads.length === 0) {
    return <Card><p className="e8d-empty">Queue is clear. Every lead has a meeting booked and a deal in the pipeline.</p></Card>
  }
  return (
    <ul className="e8d-leads">
      {s.leads.map((l) => {
        const sla = slaLabel(l.slaMins)
        return (
          <li key={l.id} className={`e8d-lead${l.slaMins < 0 ? ' e8d-lead--late' : ''}`}>
            <div className="e8d-lead-main">
              <div className="e8d-strong">{l.name} · {l.company}</div>
              <div className="e8d-lead-subject">{l.subject}</div>
              <div className="e8d-lead-meta">
                <Chip tone={sla.tone}>{sla.text}</Chip>
                <Chip status={l.status}>{l.status}</Chip>
                <span className="e8d-small">{l.attempts ? `attempt ${l.attempts}` : 'no attempts'}</span>
              </div>
            </div>
            <div className="e8d-lead-actions">
              <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.leadAction(l.id, 'call')}>Log call</button>
              <button type="button" className="e8d-btn e8d-btn--sm e8d-btn--primary" onClick={() => a.leadAction(l.id, 'book')}>Book meeting →</button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
