'use client'

import { useState } from 'react'
import { Avatar, Card, Chip, Kpi } from '../bits'
import { initials, usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState, JobColumn } from '../types'

const COLS: [JobColumn, string][] = [['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['done', 'Done']]
const SERVICES = ['Drain Cleaning · $189', 'Water Heater Repair · $285', 'Emergency Call-Out · $225', 'Camera Inspection · $150', 'Backflow Test · $120']

// The Service Dispatch board plus the "book a service call" flow. The flow is
// the demo's proof of the one-database claim: it shows each table a public
// booking writes, then the card lands on this board, in the plumber's week and
// in the client's hub, without anyone re-typing it.
export default function Dispatch({ s, a }: { s: DemoState; a: DemoActions }) {
  const [customer, setCustomer] = useState('Wesley Combe · Fremont')
  const [service, setService] = useState(SERVICES[1])
  const open = s.jobs.filter((j) => j.col !== 'done')
  const collected = s.jobs.filter((j) => j.col === 'done').reduce((n, j) => n + j.amount, 0)

  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="Service calls · 90d" value="131" sub="27 closed same day last week" />
        <Kpi label="Open cards" value={String(open.length)} sub={`${s.jobs.filter((j) => j.col === 'in_progress').length} vans on site now`} />
        <Kpi label="First-time fix" value="92%" sub="this quarter" />
        <Kpi label="Done this week" value={usd(collected)} sub={`${s.jobs.filter((j) => j.col === 'done').length} jobs invoiced`} />
      </div>

      <Card title="Workboard · Service Dispatch" aside={
        <>
          <span className="e8d-small">click a card to move it · Scheduled → In progress → Done</span>
          <button type="button" className="e8d-btn e8d-btn--sm e8d-btn--primary" onClick={() => a.openBooking(!s.bookingOpen)}>
            {s.bookingOpen ? 'Close' : '+ Book a service call'}
          </button>
        </>
      }>
        {s.bookingOpen && (
          <div className="e8d-booking">
            <form className="e8d-booking-form" onSubmit={(e) => { e.preventDefault(); a.bookServiceCall(customer.split(' · ')[0], service.split(' · ')[0]) }}>
              <div className="e8d-kpi-label">Public scheduler · trueflow.example/schedule</div>
              <label className="e8d-field">
                <span>Customer</span>
                <input className="e8d-input" value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={s.bookingBusy} />
              </label>
              <label className="e8d-field">
                <span>Service</span>
                <select className="e8d-input" value={service} onChange={(e) => setService(e.target.value)} disabled={s.bookingBusy}>
                  {SERVICES.map((sv) => <option key={sv}>{sv}</option>)}
                </select>
              </label>
              <button type="submit" className="e8d-btn e8d-btn--primary" disabled={s.bookingBusy || !customer.trim()}>
                {s.bookingBusy ? 'Writing…' : 'Book the slot'}
              </button>
            </form>
            <div className="e8d-writes">
              <div className="e8d-kpi-label">What one booking writes</div>
              <ol className="e8d-writes-list">
                {s.writes.map((w) => <li key={w} className="e8d-write"><span className="e8d-dot e8d-dot--ok" aria-hidden />{w}</li>)}
                {!s.writes.length && !s.bookingBusy && <li className="e8d-small">Six tables, one transaction. Book a slot to watch them land.</li>}
              </ol>
            </div>
          </div>
        )}
        <div className="e8d-board">
          {COLS.map(([k, label]) => (
            <div key={k} className="e8d-board-col">
              <div className="e8d-board-col-head">{label} <span className="e8d-count">{s.jobs.filter((j) => j.col === k).length}</span></div>
              {s.jobs.filter((j) => j.col === k).map((j) => (
                <button key={j.id} type="button" className={`e8d-board-card${j.fromLead ? ' e8d-board-card--new' : ''}`} onClick={() => a.moveJob(j.id)}>
                  <span className="e8d-board-card-title">{j.title}</span>
                  <span className="e8d-small">{j.customer}</span>
                  <span className="e8d-board-card-meta">
                    <span><Chip tone="neutral">{j.service}</Chip> {j.when}</span>
                    <span title={j.plumber}><Avatar who={initials(j.plumber)} /></span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
