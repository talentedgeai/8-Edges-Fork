'use client'

import type { ReactNode } from 'react'
import { toneOf } from './data'
import type { Tone } from './types'

// Small presentational pieces shared by every demo screen. Status colours come
// from the `e8d-chip--<tone>` classes, which read the status tokens, so no
// screen ever names a colour.

export function Chip({ status, tone, children }: { status?: string; tone?: Tone; children: ReactNode }) {
  const t = tone ?? toneOf(status ?? '')
  return <span className={`e8d-chip e8d-chip--${t}`}>{children}</span>
}

export function Kpi({ label, value, sub, onClick, tone }: { label: string; value: string; sub?: string; onClick?: () => void; tone?: Tone }) {
  const body = (
    <>
      <div className="e8d-kpi-label">{label}</div>
      <div className={`e8d-kpi-value${tone ? ` e8d-ink--${tone}` : ''}`}>{value}</div>
      {sub && <div className="e8d-kpi-sub">{sub}</div>}
    </>
  )
  return onClick
    ? <button type="button" className="e8d-kpi e8d-kpi--link" onClick={onClick}>{body}</button>
    : <div className="e8d-kpi">{body}</div>
}

export function Avatar({ who, agent }: { who: string; agent?: boolean }) {
  return <span className={`e8d-avatar${agent ? ' e8d-avatar--agent' : ''}`} aria-hidden>{agent ? '✦' : who}</span>
}

export function Card({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`e8d-card${className ? ` ${className}` : ''}`}>
      {(title || aside) && (
        <div className="e8d-card-head">
          {title && <h4 className="e8d-card-title">{title}</h4>}
          {aside && <div className="e8d-card-aside">{aside}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="e8d-table-wrap">
      <table className="e8d-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
