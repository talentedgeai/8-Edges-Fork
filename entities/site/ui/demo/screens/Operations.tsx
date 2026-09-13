'use client'

import { Avatar, Card, Chip, Kpi, Table } from '../bits'
import { initials, usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState } from '../types'

export function TimeOff({ s, a }: { s: DemoState; a: DemoActions }) {
  const pending = s.requests.filter((r) => r.status === 'requested').length
  return (
    <>
      <div className="e8d-kpis e8d-kpis--3">
        <Kpi label="Pending" value={String(pending)} sub="need a decision" tone={pending ? 'warn' : 'ok'} />
        <Kpi label="Out this week" value="3" sub="of 7 people" />
        <Kpi label={`Days taken · ${new Date().getFullYear()}`} value="41" sub="5.9 per person" />
      </div>
      <Card>
        <ul className="e8d-requests">
          {s.requests.map((r) => (
            <li key={r.id} className="e8d-request">
              <Avatar who={initials(r.name)} />
              <div className="e8d-request-main">
                <div className="e8d-strong">{r.name} · {r.type}</div>
                <div className="e8d-small">{r.range} · {r.days}{r.reason ? ` · “${r.reason}”` : ''}</div>
              </div>
              {r.status === 'requested' ? (
                <div className="e8d-lead-actions">
                  <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.decide(r.id, 'denied')}>Deny</button>
                  <button type="button" className="e8d-btn e8d-btn--sm e8d-btn--primary" onClick={() => a.decide(r.id, 'approved')}>Approve</button>
                </div>
              ) : (
                <Chip status={r.status}>{r.status}</Chip>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

export function Invoices({ s, a }: { s: DemoState; a: DemoActions }) {
  const overdue = s.invoices.filter((i) => i.status === 'overdue')
  const overdueSum = overdue.reduce((n, i) => n + i.amount, 0)
  const outstanding = s.invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + i.amount, 0)
  const syncing = s.qboState === 'syncing'
  return (
    <>
      <div className="e8d-kpis e8d-kpis--3">
        <Kpi label="Outstanding" value={usd(outstanding)} />
        <Kpi label="Overdue" value={usd(overdueSum)} sub={`${overdue.length} invoices`} tone={overdueSum ? 'err' : 'ok'} />
        <Kpi label="Collected · 30d" value="$212,400" />
      </div>
      <Card aside={
        <button type="button" className={`e8d-btn e8d-btn--sm${syncing ? ' e8d-btn--busy' : ''}`} onClick={a.syncQbo} disabled={syncing}>
          <span className={syncing ? 'e8d-spin' : ''} aria-hidden>⟳</span> {syncing ? 'Syncing QuickBooks…' : `Sync QuickBooks · ${s.qboLast}`}
        </button>
      }>
        <Table head={['Invoice', 'Client', 'Amount', 'Due', 'Status', '']}>
          {s.invoices.map((iv) => (
            <tr key={iv.no} className="e8d-row">
              <td className="e8d-strong">{iv.no}</td>
              <td>{iv.client}</td>
              <td className="e8d-num">{usd(iv.amount)}</td>
              <td>{iv.due}</td>
              <td><Chip status={iv.status}>{iv.status === 'overdue' ? `overdue · ${iv.over}d` : iv.status}</Chip></td>
              <td className="e8d-right">
                {iv.status === 'overdue' && (
                  <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.remindInvoice(iv.no)}>✦ Draft reminder</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
