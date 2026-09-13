'use client'

import { useEffect, useState } from 'react'
import { usd } from './data'
import type { DemoState } from './types'

// One line under the frame that adds up what the visitor changed. Every
// number comes from the action log the hook keeps, so it only ever reflects
// their own clicks, never the opening sequence or the background agents.
export default function Scoreboard({ s }: { s: DemoState }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const acts = s.actions
  if (!acts.length) {
    return (
      <p className="e8d-score-line e8d-score-line--empty">
        Everything you change in the demo is counted here. Approve something, book a call, move a card.
      </p>
    )
  }
  const decisions = acts.filter((a) => a.kind === 'leave' || a.kind === 'invoice' || a.kind === 'candidate').length
  const booked = acts.filter((a) => a.kind !== 'invoice').reduce((n, a) => n + (a.amount ?? 0), 0)
  const collected = acts.filter((a) => a.kind === 'invoice').reduce((n, a) => n + (a.amount ?? 0), 0)
  const moves = acts.filter((a) => a.kind === 'job' || a.kind === 'booking' || a.kind === 'lead' || a.kind === 'deal').length
  const agents = acts.filter((a) => a.kind === 'routine' || a.kind === 'campaign').length
  const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000))

  const parts: string[] = []
  if (decisions) parts.push(`cleared ${decisions} decision${decisions === 1 ? '' : 's'}`)
  if (moves) parts.push(`moved ${moves} piece${moves === 1 ? '' : 's'} of work`)
  if (booked) parts.push(`booked ${usd(booked)} of jobs`)
  if (collected) parts.push(`collected ${usd(collected)}`)
  if (agents) parts.push(`handed ${agents} job${agents === 1 ? '' : 's'} to agents`)
  const others = acts.length - decisions - moves - agents
  if (others > 0 && parts.length === 0) parts.push(`made ${others} change${others === 1 ? '' : 's'}`)

  return (
    <p className="e8d-score-line" role="status">
      <span className="e8d-score-dot" aria-hidden />
      In {mins} minute{mins === 1 ? '' : 's'} you {parts.join(', ')}. {acts.length} change{acts.length === 1 ? '' : 's'}, all in audit_log.
      <span className="e8d-score-more"> Imagine it on your data.</span>
    </p>
  )
}
