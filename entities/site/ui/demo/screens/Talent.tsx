'use client'

import { Avatar, Card, Chip, Table } from '../bits'
import { initials, PEOPLE } from '../data'
import type { DemoActions } from '../useDemo'
import type { CandidateStage, DemoState } from '../types'

const NEXT: Record<CandidateStage, string> = { Applied: 'Phone screen →', 'Phone Screen': 'Ride-along →', 'Ride-Along': 'Make offer →', Offer: 'Mark hired →', Hired: 'Hired ✓' }

export function Team() {
  return (
    <Card>
      <Table head={['Name', 'Role', 'Office', 'Manager', 'Since', 'Stage']}>
        {PEOPLE.map((p) => (
          <tr key={p.name} className="e8d-row">
            <td><span className="e8d-person"><Avatar who={initials(p.name)} /><span className="e8d-strong">{p.name}</span></span></td>
            <td>{p.role}</td>
            <td>{p.dept}</td>
            <td>{p.mgr}</td>
            <td>{p.since}</td>
            <td><Chip status={p.stage}>{p.stage}</Chip></td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}

export function Candidates({ s, a }: { s: DemoState; a: DemoActions }) {
  return (
    <>
      <div className="e8d-callout">
        <span className="e8d-callout-icon" aria-hidden>✦</span>
        <div>
          <strong>AI screening ran on all 23 applications this month for the two open plumber reqs.</strong>{' '}
          Every résumé is extracted, scored against the req and summarised before a human opens it. Three are waiting on you.
        </div>
      </div>
      <Card>
        <Table head={['Candidate', 'Role', 'AI screen', 'Stage', '']}>
          {s.candidates.map((c, i) => (
            <tr key={c.name} className="e8d-row">
              <td>
                <div className="e8d-strong">{c.name}</div>
                <div className="e8d-small">{c.note}</div>
              </td>
              <td>{c.role}</td>
              <td><span className={`e8d-score e8d-ink--${c.score >= 85 ? 'ok' : c.score >= 70 ? 'info' : 'warn'}`}>{c.score}</span></td>
              <td><Chip status={c.stage}>{c.stage}</Chip></td>
              <td className="e8d-right">
                <button type="button" className="e8d-btn e8d-btn--sm" disabled={c.stage === 'Hired'} onClick={() => a.advanceCandidate(i)}>{NEXT[c.stage]}</button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
