'use client'

import { DEMOS, SANDBOX_URL, URL_PATH } from './data'
import type { TryAction } from './tour'
import type { Page } from './types'

// The tab bar over the app frame: one tab per demo, and a single caption line
// under it with the value the demo proves and a few things to try.
export default function DemoTabs({ demo, page, actions, onSelect }: { demo: string; page: Page; actions: TryAction[]; onSelect: (id: string) => void }) {
  const cur = DEMOS.find((d) => d.id === demo) ?? DEMOS[0]
  return (
    <div className="e8d-demos">
      <div className="e8d-tabbar" role="tablist" aria-label="Demos">
        {DEMOS.map((d, i) => (
          <button key={d.id} type="button" role="tab" aria-selected={d.id === demo} className={`e8d-tabbar-tab${d.id === demo ? ' e8d-tabbar-tab--active' : ''}`} onClick={() => onSelect(d.id)}>
            <span className="e8d-tabbar-num" aria-hidden>{i + 1}</span>
            {d.label}
          </button>
        ))}
      </div>
      <div className="e8d-caption">
        {/* The value sentence is read to screen readers only; sighted visitors get the chips. */}
        <p className="u-hidden">{cur.value}</p>
        <div className="e8d-caption-actions">
          <span className="e8d-tour-try">Try it:</span>
          {actions.map((x) => (
            <button key={x.label} type="button" className="e8d-caption-action" onClick={x.run}>▸ {x.label}</button>
          ))}
          <a className="e8d-caption-live" href={`${SANDBOX_URL}${URL_PATH[page]}`} target="_blank" rel="noopener noreferrer" title="Opens the live sandbox at 8edges.app (sign-in required)">
            Open live ↗
          </a>
        </div>
      </div>
    </div>
  )
}
