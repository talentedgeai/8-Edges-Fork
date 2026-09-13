'use client'

import { Avatar, Card, Chip, Kpi } from '../bits'
import { initials, range, usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState, KeyResult } from '../types'

// The team portal, signed in as Chuck Bearden. Same rows as the admin screens:
// his jobs are the dispatch cards assigned to him, his goals are the key
// results he owns, his ideas are the innovation backlog.
const ME = 'Chuck Bearden'

export function MyWeek({ s, a }: { s: DemoState; a: DemoActions }) {
  const mine = s.jobs.filter((j) => j.plumber === ME)
  const open = mine.filter((j) => j.col !== 'done')
  const myLeave = s.requests.filter((r) => r.name === ME)
  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="My jobs this week" value={String(open.length)} sub={`${mine.filter((j) => j.col === 'done').length} done`} />
        <Kpi label="First-time fix" value="97%" sub="best on the crew" tone="ok" />
        <Kpi label="Leave left" value="4 days" sub={myLeave.length ? `${myLeave[0].type} ${myLeave[0].range} · ${myLeave[0].status}` : 'none booked'} />
        <Kpi label="My apprentice" value="Sal" sub="probation review in 9 days" />
      </div>
      <div className="e8d-two-col">
        <Card title="My route" aside={<span className="e8d-small">tap a card when you arrive or finish</span>}>
          <ul className="e8d-route">
            {open.map((j) => (
              <li key={j.id} className="e8d-route-item">
                <div>
                  <div className="e8d-strong">{j.when} · {j.customer}</div>
                  <div className="e8d-small">{j.title} · {j.service} · {usd(j.amount)}</div>
                </div>
                <div className="e8d-lead-actions">
                  <Chip status={j.col}>{j.col === 'in_progress' ? 'on site' : 'scheduled'}</Chip>
                  <button type="button" className="e8d-btn e8d-btn--sm e8d-btn--primary" onClick={() => a.moveJob(j.id)}>{j.col === 'scheduled' ? 'Arrived' : 'Finished'}</button>
                </div>
              </li>
            ))}
            {!open.length && <li className="e8d-small">Route clear. Dispatch will assign the next card.</li>}
          </ul>
        </Card>
        <div className="e8d-stack">
          <Card title="My coach notes" aside={<span className="e8d-small">from the coaching cycle agent</span>}>
            <p className="e8d-feed-text">Sal&rsquo;s ride-along check-in is due today. His first-time fix on solo calls is 9 of 11; the two misses were both water heaters in crawlspaces, which is your own lesson from last month.</p>
            <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.ask('How is my apprentice doing?')}>✦ Ask about Sal</button>
          </Card>
          <Card title="Time off" aside={<Chip status="approved">{range(-2, -2)} · approved</Chip>}>
            <p className="e8d-small">Personal day taken {range(-2, -2)}. Lena is off {range(3, 5)}; Denny has asked for {range(7, 11)}.</p>
          </Card>
        </div>
      </div>
    </>
  )
}

const fmtVal = (k: KeyResult, v: number) => (k.unit === '$' ? usd(v) : `${v}${k.unit}`)

export function MyGoals({ s, a }: { s: DemoState; a: DemoActions }) {
  const mine = s.krs.flatMap((o, oi) => o.krs.map((k, ki) => ({ o, k, key: `${oi}-${ki}`, oi, ki }))).filter((x) => x.k.owner === 'CB' || x.o.office === 'Operations')
  return (
    <Card title="Key results I own or contribute to" aside={<span className="e8d-small">same rows the owner sees on Company Goals</span>}>
      <ul className="e8d-kr-list">
        {mine.map(({ o, k, key, oi, ki }) => (
          <li key={key} className="e8d-kr">
            <div className="e8d-kr-head">
              <span className="e8d-kr-title"><span className={`e8d-dot e8d-dot--${o.office.toLowerCase()}`} aria-hidden /> {k.title}</span>
              <Chip status={o.health}>{o.health}</Chip>
            </div>
            <div className="e8d-kr-foot">
              <span className="e8d-small">{fmtVal(k, k.cur)} / {fmtVal(k, k.target)} · owner <Avatar who={k.owner} agent={k.owner === 'AG'} /> {k.ownerTitle}</span>
              {k.owner === 'CB' && (s.editingKr === key ? (
                <form className="e8d-kr-edit" onSubmit={(e) => { e.preventDefault(); a.saveKr(oi, ki) }}>
                  <input className="e8d-input e8d-input--sm" value={s.krDraft} onChange={(e) => a.setKrDraft(e.target.value)} aria-label={`New value for ${k.title}`} autoFocus />
                  <button type="submit" className="e8d-btn e8d-btn--sm e8d-btn--primary">Save</button>
                </form>
              ) : (
                <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.editKr(key, String(k.cur))}>Check in</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function TeamIdeas({ s, a }: { s: DemoState; a: DemoActions }) {
  return (
    <Card title="Ideas & lessons from the field" aside={<span className="e8d-small">the same backlog the owner votes on</span>}>
      <form className="e8d-idea-add" onSubmit={(e) => { e.preventDefault(); a.addIdea() }}>
        <input className="e8d-input" placeholder="Log a build idea or a lesson from a job…" value={s.ideaDraft} onChange={(e) => a.setIdeaDraft(e.target.value)} aria-label="New idea" />
        <button type="submit" className="e8d-btn e8d-btn--primary" disabled={!s.ideaDraft.trim()}>Add</button>
      </form>
      <ul className="e8d-ideas">
        {s.ideas.map((id, i) => (
          <li key={id.title} className="e8d-idea">
            <button type="button" className={`e8d-vote${s.voted[i] ? ' e8d-vote--on' : ''}`} onClick={() => a.vote(i)} aria-pressed={!!s.voted[i]} aria-label={`Vote for ${id.title}`}>▲ {id.votes}</button>
            <div className="e8d-idea-main">
              <div className="e8d-strong">{id.title}</div>
              <div className="e8d-small"><Avatar who={initials(id.by.split(' · ')[0])} /> {id.by}</div>
            </div>
            <Chip status={id.kind}>{id.kind}</Chip>
          </li>
        ))}
      </ul>
    </Card>
  )
}
