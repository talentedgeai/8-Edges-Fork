'use client'

import { Card, Chip, Kpi, Table } from '../bits'
import type { DemoActions } from '../useDemo'
import { ago } from '../useDemo'
import type { DemoState } from '../types'

export default function Agents({ s, a }: { s: DemoState; a: DemoActions }) {
  return (
    <>
      <div className="e8d-kpis">
        <Kpi label="Last run OK" value="11" tone="ok" />
        <Kpi label="Skipped" value="2" sub="nothing due" tone="warn" />
        <Kpi label="Failing" value="0" />
        <Kpi label="AI tokens · 30d" value="1.1M" sub="≈ $9 spend" />
      </div>
      <Card>
        <Table head={['Routine', 'Schedule', 'Last run', 'Reported', '']}>
          {s.routines.map((r, i) => {
            const running = s.runningIdx === i
            return (
              <tr key={r.name} className="e8d-row">
                <td>
                  <div className="e8d-strong">{r.name}</div>
                  <div className="e8d-small">{r.office}</div>
                </td>
                <td>{r.schedule}</td>
                <td>
                  <Chip status={running ? 'running' : r.status}>{running ? 'running' : r.status}</Chip>
                  {!running && <span className="e8d-small e8d-ml">{ago(r.ranAt, r.last)}</span>}
                </td>
                <td className="e8d-reported">{r.reported}</td>
                <td className="e8d-right">
                  <button type="button" className="e8d-btn e8d-btn--sm" onClick={() => a.runRoutine(i)} disabled={s.runningIdx != null}>Run now</button>
                </td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
