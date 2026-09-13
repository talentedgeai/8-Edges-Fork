'use client'

import { Avatar, Card, Chip } from '../bits'
import { usd } from '../data'
import type { DemoActions } from '../useDemo'
import type { DemoState, KeyResult } from '../types'

function pctOf(k: KeyResult): number {
  const raw = k.down ? (k.cur <= k.target ? 100 : (k.target / k.cur) * 100) : (k.cur / k.target) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}
const fmtVal = (k: KeyResult, v: number) => (k.unit === '$' ? usd(v) : `${v}${k.unit}`)

export default function Goals({ s, a }: { s: DemoState; a: DemoActions }) {
  return (
    <div className="e8d-goals">
      {s.krs.map((o, oi) => (
        <Card key={o.office} className="e8d-objective"
          title={<><span className={`e8d-dot e8d-dot--${o.office.toLowerCase()}`} aria-hidden />{o.office}</>}
          aside={<Chip status={o.health}>{o.health}</Chip>}>
          <p className="e8d-objective-title">{o.title}</p>
          <ul className="e8d-kr-list">
            {o.krs.map((k, ki) => {
              const key = `${oi}-${ki}`
              const pct = pctOf(k)
              const band = pct >= 90 ? 'ok' : pct >= 70 ? 'info' : 'warn'
              const editing = s.editingKr === key
              return (
                <li key={k.title} className="e8d-kr">
                  <div className="e8d-kr-head">
                    <span className="e8d-kr-title">{k.title}</span>
                    <Chip status={k.mix}>{k.mix}</Chip>
                  </div>
                  <progress className={`e8d-progress e8d-progress--${band}`} value={pct} max={100} aria-label={`${k.title}: ${pct}%`} />
                  <div className="e8d-kr-foot">
                    <span className="e8d-small">{fmtVal(k, k.cur)} / {fmtVal(k, k.target)}</span>
                    <span className="e8d-kr-owner" title={k.ownerTitle}><Avatar who={k.owner} agent={k.owner === 'AG'} /></span>
                    {editing ? (
                      <form className="e8d-kr-edit" onSubmit={(e) => { e.preventDefault(); a.saveKr(oi, ki) }}>
                        <input
                          className="e8d-input e8d-input--sm"
                          value={s.krDraft}
                          onChange={(e) => a.setKrDraft(e.target.value)}
                          aria-label={`New value for ${k.title}`}
                          autoFocus
                        />
                        <button type="submit" className="e8d-btn e8d-btn--sm e8d-btn--primary">Save</button>
                      </form>
                    ) : (
                      <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.editKr(key, String(k.cur))}>Check in</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
