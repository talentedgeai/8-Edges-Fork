'use client'

import { Card, Chip, Kpi } from '../bits'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

const SATISFACTION = [
  { client: 'Cedar Point Apartments', score: 4.8, trend: 'up' },
  { client: 'Harborview Property Group', score: 4.6, trend: 'flat' },
  { client: 'Emerald City Chophouse', score: 4.9, trend: 'up' },
  { client: 'Lakeside Montessori School', score: 5.0, trend: 'flat' },
  { client: 'The Fremont Foundry Hotel', score: 2.9, trend: 'down' },
]

// Revenue's other half: keep the customers you already have. One campaign to
// the residential book, and the satisfaction survey the agents send after every
// job, which is how an at-risk account surfaces before it churns.
export default function Marketing({ s, a }: { s: DemoState; a: DemoActions }) {
  const sent = s.campaign === 'sent'
  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="Residential customers" value="50" sub="completed job in 12 months" />
        <Kpi label="Commercial accounts" value="8" sub="each with a client hub" />
        <Kpi label="Satisfaction · 30d" value="4.7" sub="41 responses · 93% recommend" tone="ok" />
        <Kpi label="At-risk accounts" value="1" sub="Fremont Foundry trending down" tone="err" />
      </div>
      <div className="e8d-two-col">
        <Card title="Winter Pipe-Freeze Checkup" aside={<Chip status={sent ? 'active' : s.campaign}>{sent ? 'sent' : s.campaign}</Chip>}>
          <p className="e8d-page-sub">Book preventive inspections before the first freeze. One email, one segment, one agent to send it.</p>
          <div className="e8d-email">
            <div className="e8d-email-row"><span className="e8d-kpi-label">Subject</span><span className="e8d-strong">Beat the Freeze: $59 Winter Inspection</span></div>
            <div className="e8d-email-row"><span className="e8d-kpi-label">Preheader</span><span>Catch a weak pipe before it bursts.</span></div>
            <div className="e8d-email-row"><span className="e8d-kpi-label">Segment</span><span>Residential · completed job in 12 months · consent given · <strong>50 people</strong></span></div>
            <div className="e8d-email-row"><span className="e8d-kpi-label">From</span><span>dana@trueflow · via the campaign agent, every 15 min</span></div>
          </div>
          <div className="e8d-lead-actions">
            <button type="button" className="e8d-btn e8d-btn--primary" onClick={a.sendCampaign} disabled={s.campaign !== 'draft'}>
              {s.campaign === 'sending' ? 'Handing to the agent…' : sent ? 'Sent to 50 customers ✓' : 'Send to 50 customers'}
            </button>
            <button type="button" className="e8d-btn" onClick={() => a.ask('What did the last campaign do?')}>✦ Last campaign results</button>
          </div>
        </Card>
        <Card title="Post-Service Satisfaction" aside={<span className="e8d-small">sent after every completed job</span>}>
          <ul className="e8d-sat">
            {SATISFACTION.map((r) => (
              <li key={r.client} className="e8d-sat-row">
                <span className="e8d-strong">{r.client}</span>
                <span className={`e8d-sat-score e8d-ink--${r.score >= 4.5 ? 'ok' : r.score >= 3.5 ? 'warn' : 'err'}`}>{r.score.toFixed(1)}</span>
                <Chip tone={r.trend === 'down' ? 'err' : r.trend === 'up' ? 'ok' : 'neutral'}>{r.trend === 'down' ? '↓ at risk' : r.trend === 'up' ? '↑ up' : '→ steady'}</Chip>
              </li>
            ))}
          </ul>
          <button type="button" className="e8d-btn e8d-btn--sm e8d-btn--block" onClick={() => a.setPortal('client')}>See what Cedar Point sees → client portal</button>
        </Card>
      </div>
    </>
  )
}
