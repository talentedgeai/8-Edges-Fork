'use client'

import { Chip } from './bits'
import { usd } from './data'
import type { Deal } from './types'

const STAGE_ORDER: Deal['stage'][] = ['Discovery', 'Proposal', 'Negotiation', 'Won']

export default function DealDrawer({ deal, onClose, onAdvance, onAsk }: { deal: Deal; onClose: () => void; onAdvance: () => void; onAsk: () => void }) {
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(deal.stage) + 1]
  return (
    <>
      <button type="button" className="e8d-scrim e8d-scrim--drawer" aria-label="Close deal" onClick={onClose} />
      <aside className="e8d-drawer" role="dialog" aria-label={`Deal 360: ${deal.name}`}>
        <div className="e8d-drawer-head">
          <div>
            <div className="e8d-kpi-label">Deal 360</div>
            <h4 className="e8d-drawer-title">{deal.name}</h4>
            <div className="e8d-small">{deal.company}</div>
          </div>
          <button type="button" className="e8d-icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <dl className="e8d-drawer-facts">
          <div><dt>Amount</dt><dd className="e8d-strong">{deal.amount ? usd(deal.amount) : '—'}</dd></div>
          <div><dt>Stage</dt><dd><Chip status={deal.stage}>{deal.stage}</Chip></dd></div>
          <div><dt>Owner</dt><dd>{deal.owner}</dd></div>
          <div><dt>Expected close</dt><dd>{deal.close}</dd></div>
        </dl>
        {next && (
          <button type="button" className="e8d-btn e8d-btn--primary e8d-btn--block" onClick={onAdvance}>Move to {next} →</button>
        )}
        <div className="e8d-drawer-section">
          <div className="e8d-kpi-label">Next step</div>
          <p className="e8d-drawer-next">{deal.next}</p>
        </div>
        <div className="e8d-drawer-section">
          <div className="e8d-kpi-label">Activity</div>
          <ul className="e8d-activity">
            {deal.activity.map((ac, i) => (
              <li key={`${ac.text}-${i}`}>
                <span className={`e8d-dot e8d-dot--${ac.tone}`} aria-hidden />
                <span>{ac.text}</span>
                <span className="e8d-small">{ac.when}</span>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className="e8d-btn e8d-btn--block" onClick={onAsk}>✦ Ask the assistant about this deal</button>
      </aside>
    </>
  )
}
