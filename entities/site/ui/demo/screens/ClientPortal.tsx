'use client'

import { Avatar, Card, Chip, Kpi, Table } from '../bits'
import { initials, usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

// The client portal, signed in as the Cedar Point Apartments facilities
// contact. Roadmap phases and staff come from the client hub; bookings and
// invoices are the same rows dispatch and finance work from.
const CLIENT = 'Cedar Point Apartments'
const ROADMAP = [
  { phase: 'Phase 1', title: 'Assessment & camera survey', status: 'done' },
  { phase: 'Phase 2', title: 'Risers — stacks A/B (floors 1–4)', status: 'scheduled' },
  { phase: 'Phase 3', title: 'Risers — stacks C/D (floors 1–4)', status: 'new' },
  { phase: 'Phase 4', title: 'Commissioning & tenant sign-off', status: 'new' },
]

export function ClientHub({ s, a }: { s: DemoState; a: DemoActions }) {
  const jobs = s.jobs.filter((j) => j.customer === CLIENT)
  const openInv = s.invoices.filter((i) => i.client === CLIENT && i.status !== 'paid')
  const riser = s.deals.find((d) => d.company === CLIENT)
  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="Open work" value={String(jobs.filter((j) => j.col !== 'done').length)} sub={`${jobs.filter((j) => j.col === 'in_progress').length} on site now`} />
        <Kpi label="Riser project" value={riser?.stage ?? '—'} sub={riser ? `${usd(riser.amount)} · close ${riser.close}` : ''} />
        <Kpi label="Open invoices" value={usd(openInv.reduce((n, i) => n + i.amount, 0))} sub={`${openInv.length} invoices`} onClick={() => a.setPage('client-invoices')} />
        <Kpi label="Your rating of us" value="4.8" sub="last 3 visits" tone="ok" />
      </div>
      <div className="e8d-two-col">
        <Card title="Building B riser replacement" aside={<span className="e8d-small">roadmap · updated by Ray</span>}>
          <ol className="e8d-roadmap">
            {ROADMAP.map((r) => (
              <li key={r.phase} className={`e8d-roadmap-step e8d-roadmap-step--${r.status}`}>
                <span className="e8d-roadmap-dot" aria-hidden />
                <div>
                  <div className="e8d-kpi-label">{r.phase}</div>
                  <div className="e8d-strong">{r.title}</div>
                </div>
                <Chip status={r.status}>{r.status === 'new' ? 'planned' : r.status}</Chip>
              </li>
            ))}
          </ol>
          <p className="e8d-small">{riser?.next}</p>
        </Card>
        <div className="e8d-stack">
          <Card title="Service visits" aside={<button type="button" className="e8d-link" onClick={() => a.setPage('requests')}>Request a visit →</button>}>
            <ul className="e8d-route">
              {jobs.map((j) => (
                <li key={j.id} className="e8d-route-item">
                  <div>
                    <div className="e8d-strong">{j.title}</div>
                    <div className="e8d-small"><Avatar who={initials(j.plumber)} /> {j.plumber} · {j.when}</div>
                  </div>
                  <Chip status={j.col}>{j.col === 'in_progress' ? 'on site' : j.col}</Chip>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Your TrueFlow team">
            <ul className="e8d-team-list">
              <li><Avatar who="RT" /> <span><span className="e8d-strong">Ray Truesdale</span> <span className="e8d-small">account owner</span></span></li>
              <li><Avatar who="DW" /> <span><span className="e8d-strong">Dana Whitfield</span> <span className="e8d-small">dispatch · your first call</span></span></li>
              <li><Avatar who="DO" /> <span><span className="e8d-strong">Denny Okafor</span> <span className="e8d-small">your regular plumber</span></span></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}

export function ClientInvoices({ s }: { s: DemoState }) {
  const mine = s.invoices.filter((i) => i.client === CLIENT)
  return (
    <Card title="Invoices" aside={<span className="e8d-small">live from TrueFlow&rsquo;s books · pay online</span>}>
      <Table head={['Invoice', 'Amount', 'Due', 'Status', '']}>
        {mine.map((iv) => (
          <tr key={iv.no} className="e8d-row">
            <td className="e8d-strong">{iv.no}</td>
            <td className="e8d-num">{usd(iv.amount)}</td>
            <td>{iv.due}</td>
            <td><Chip status={iv.status}>{iv.status === 'overdue' ? `overdue · ${iv.over}d` : iv.status}</Chip></td>
            <td className="e8d-right">{iv.status !== 'paid' && <button type="button" className="e8d-btn e8d-btn--sm">Pay now</button>}</td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}

export function Requests({ s, a }: { s: DemoState; a: DemoActions }) {
  return (
    <Card title="Requests" aside={<span className="e8d-small">lands in TrueFlow&rsquo;s lead queue with a 60-minute clock</span>}>
      <form className="e8d-idea-add" onSubmit={(e) => { e.preventDefault(); a.submitRequest() }}>
        <input className="e8d-input" placeholder="Describe the issue, e.g. “Unit 22C · no hot water since this morning”" value={s.requestDraft} onChange={(e) => a.setRequestDraft(e.target.value)} aria-label="New request" />
        <button type="submit" className="e8d-btn e8d-btn--primary" disabled={!s.requestDraft.trim()}>Send</button>
      </form>
      <ul className="e8d-route">
        {s.clientRequests.map((r) => (
          <li key={r.id} className="e8d-route-item">
            <div>
              <div className="e8d-strong">{r.title}</div>
              <div className="e8d-small">{r.by} · {r.when}</div>
            </div>
            <Chip status={r.status}>{r.status}</Chip>
          </li>
        ))}
      </ul>
    </Card>
  )
}
