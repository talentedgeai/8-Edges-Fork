'use client'

import { PAGE_LABEL, PORTAL_USER } from './data'
import type { Page, Portal } from './types'

// One flat list of the active demo's screens. A screen that lives in another
// door is marked with the door, so the visitor knows the frame will switch.
export default function DemoSidebar({ portal, page, pages, open, onGo, onClose }: { portal: Portal; page: Page; pages: Page[]; open: boolean; onGo: (p: Page) => void; onClose: () => void }) {
  const user = PORTAL_USER[portal]
  return (
    <>
      {open && <button type="button" className="e8d-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`e8d-sidebar e8d-sidebar--${portal}${open ? ' e8d-sidebar--open' : ''}`} aria-label={`${portal} portal navigation`}>
        <div className="e8d-sidebar-brand">
          <span className="e8d-sidebar-logo" aria-hidden>8</span>
          <span>{portal === 'client' ? 'TrueFlow' : '8 Edges'}</span>
          <span className="e8d-sidebar-user" title={user.name}>{user.ini}</span>
        </div>
        <div className="e8d-sidebar-who">
          <div className="e8d-strong">{user.name}</div>
          <div className="e8d-small">{user.sub}</div>
        </div>
        <div className="e8d-nav-flat">
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              className={`e8d-nav-item${page === p ? ' e8d-nav-item--active' : ''}`}
              aria-current={page === p ? 'page' : undefined}
              onClick={() => onGo(p)}
            >
              {PAGE_LABEL[p]}
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
