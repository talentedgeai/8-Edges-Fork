'use client'

import { useMemo } from 'react'
import Assistant from './Assistant'
import DealDrawer from './DealDrawer'
import DemoSidebar from './DemoSidebar'
import DemoTabs from './DemoTabs'
import Scoreboard from './Scoreboard'
import { DEMOS, PAGE_PORTAL, PORTAL_USER, URL_PATH } from './data'
import Agents from './screens/Agents'
import { ClientHub, ClientInvoices, Requests } from './screens/ClientPortal'
import Dashboard from './screens/Dashboard'
import Dispatch from './screens/Dispatch'
import Goals from './screens/Goals'
import Innovation from './screens/Innovation'
import Marketing from './screens/Marketing'
import { Invoices, TimeOff } from './screens/Operations'
import { Deals, Leads } from './screens/Revenue'
import Strategy from './screens/Strategy'
import { Candidates, Team } from './screens/Talent'
import { MyGoals, MyWeek, TeamIdeas } from './screens/TeamPortal'
import { heads, tryActions } from './tour'
import type { Portal } from './types'
import { useDemo } from './useDemo'

const PORTALS: Portal[] = ['admin', 'team', 'client']

export default function DemoShell() {
  const { state: s, actions: a, prompts } = useDemo()
  const demo = DEMOS.find((d) => d.id === s.demo) ?? DEMOS[0]
  const [eyebrow, title, sub] = heads(s)[s.page]
  const actions = useMemo(() => tryActions(s.demo, s, a).map((t) => ({ ...t, run: () => { a.stopAutoplay(); t.run() } })), [s, a])
  const selectDemo = (id: string) => { a.stopAutoplay(); a.setDemo(id) }
  const drawerDeal = s.drawer != null ? s.deals[s.drawer] : null
  // The Admin / Team / Client switcher only shows where the demo is about the
  // doors themselves; elsewhere the sidebar moves between doors on its own.
  const portalsInDemo = PORTALS.filter((p) => demo.pages.some((pg) => PAGE_PORTAL[pg] === p))

  return (
    <div className="e8d">
      <DemoTabs demo={s.demo} page={s.page} actions={actions} onSelect={selectDemo} />

      <div className={`e8d-frame${s.autoplay ? ' e8d-frame--autoplay' : ''}`} onPointerDownCapture={a.stopAutoplay} onKeyDownCapture={a.stopAutoplay}>
        <div className="e8d-browser-bar">
          <button type="button" className="e8d-icon-btn e8d-menu-btn" aria-label="Toggle navigation" onClick={a.toggleNav}>☰</button>
          <span className="e8d-browser-dots" aria-hidden><span /><span /><span /></span>
          <span className="e8d-browser-url" aria-hidden>8edges.app{URL_PATH[s.page]}</span>
          {demo.portals && (
            <div className="e8d-portals" role="tablist" aria-label="Portal">
              {portalsInDemo.map((p) => (
                <button key={p} type="button" role="tab" aria-selected={s.portal === p} className={`e8d-portal${s.portal === p ? ' e8d-portal--active' : ''}`} onClick={() => a.setPortal(p)} title={PORTAL_USER[p].name}>
                  {p === 'admin' ? 'Admin' : p === 'team' ? 'Team' : 'Client'}
                </button>
              ))}
            </div>
          )}
          {s.autoplay
            ? <button type="button" className="e8d-autoplay" onClick={a.stopAutoplay}><span className="e8d-autoplay-dot" aria-hidden />Watching the agents work · click to take over</button>
            : <span className="e8d-sample">● Sample data</span>}
        </div>

        <div className="e8d-app">
          <DemoSidebar portal={s.portal} page={s.page} pages={demo.pages} open={s.navOpen} onGo={a.go} onClose={a.toggleNav} />

          <main className="e8d-main">
            <header className="e8d-page-head">
              <div className="e8d-eyebrow">{eyebrow}</div>
              <h3 className="e8d-page-title">{title}</h3>
              <p className="e8d-page-sub">{sub}</p>
            </header>

            <div className="e8d-screen" key={s.page}>
              {s.page === 'strategy' && <Strategy s={s} a={a} />}
              {s.page === 'goals' && <Goals s={s} a={a} />}
              {s.page === 'dashboard' && <Dashboard s={s} a={a} />}
              {s.page === 'leads' && <Leads s={s} a={a} />}
              {s.page === 'deals' && <Deals s={s} a={a} />}
              {s.page === 'marketing' && <Marketing s={s} a={a} />}
              {s.page === 'dispatch' && <Dispatch s={s} a={a} />}
              {s.page === 'team' && <Team />}
              {s.page === 'candidates' && <Candidates s={s} a={a} />}
              {s.page === 'timeoff' && <TimeOff s={s} a={a} />}
              {s.page === 'invoices' && <Invoices s={s} a={a} />}
              {s.page === 'innovation' && <Innovation s={s} a={a} />}
              {s.page === 'agents' && <Agents s={s} a={a} />}
              {s.page === 'my-week' && <MyWeek s={s} a={a} />}
              {s.page === 'my-goals' && <MyGoals s={s} a={a} />}
              {s.page === 'team-ideas' && <TeamIdeas s={s} a={a} />}
              {s.page === 'hub' && <ClientHub s={s} a={a} />}
              {s.page === 'client-invoices' && <ClientInvoices s={s} />}
              {s.page === 'requests' && <Requests s={s} a={a} />}
            </div>
          </main>

          {drawerDeal && <DealDrawer deal={drawerDeal} onClose={a.closeDrawer} onAdvance={a.advanceDeal} onAsk={a.askAboutDeal} />}

          {s.portal === 'admin' && (
            <Assistant open={s.chatOpen} messages={s.messages} typing={s.typing} input={s.chatInput} prompts={prompts}
              onToggle={a.toggleChat} onInput={a.setChatInput} onAsk={a.ask} />
          )}

          {s.toast && (
            <div className="e8d-toast" role="status">
              <span>✓ {s.toast.text}</span>
              {s.toast.link && <button type="button" className="e8d-toast-link" onClick={a.toastGo}>{s.toast.link} →</button>}
            </div>
          )}
        </div>
      </div>

      <Scoreboard s={s} />
    </div>
  )
}
