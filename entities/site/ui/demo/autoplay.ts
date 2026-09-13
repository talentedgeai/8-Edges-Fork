import { fmt } from './data'
import type { DemoState, FeedItem, Job, Page } from './types'

// The opening sequence. For about ten seconds after the page loads the frame
// runs itself: a request comes in, the agent flags it, a card lands on the
// workboard, a job finishes and raises its invoice, a key result moves. Then
// it hands control back. Any click or key press in the frame stops it early.
// Nothing here is logged as the visitor's own action, so the scoreboard stays
// honest about what *they* changed.

export type AutoplayApi = {
  set: (patch: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) => void
  go: (page: Page) => void
  toast: (text: string) => void
  feed: (who: string, text: string) => void
}

export type Step = { at: number; run: (api: AutoplayApi) => void }

const INTRO_JOB: Job = { id: 'J-1048', title: 'Water Heater Repair', customer: 'Faye Mercer', service: 'Water Heaters', plumber: 'Sal Moreno', col: 'scheduled', when: `${fmt(1)} 08:00`, amount: 285, fromLead: true }

export const INTRO: Step[] = [
  { at: 900, run: (a) => { a.go('dispatch') } },
  { at: 2200, run: (a) => {
    a.feed('AG', 'Speed-to-lead agent: Faye Mercer (no hot water) is 1 h past SLA · Dana pinged in Lark')
    a.toast('New request past SLA · Dana pinged')
  } },
  { at: 4200, run: (a) => {
    a.set((s) => ({ jobs: s.jobs.some((j) => j.id === INTRO_JOB.id) ? s.jobs : [INTRO_JOB, ...s.jobs], leads: s.leads.filter((l) => l.name !== 'Faye Mercer') }))
    a.feed('DW', 'Dana Whitfield booked Faye Mercer · water heater repair · Sal Moreno auto-assigned')
    a.toast('Booked · card on the workboard · lead closed')
  } },
  { at: 6400, run: (a) => {
    a.set((s) => ({ jobs: s.jobs.map((j) => j.id === 'J-1043' ? { ...j, col: 'done' } : j), invoices: [{ no: 'INV-2053', client: 'Pike & Pine Bistro', amount: 450, due: fmt(14), status: 'sent' }, ...s.invoices] }))
    a.feed('LV', 'Lena Vu completed “Floor drain · hydro-jet” · INV-2053 drafted in QuickBooks')
    a.toast('Job done · INV-2053 drafted in QuickBooks')
  } },
  { at: 8400, run: (a) => { a.go('goals') } },
  { at: 9200, run: (a) => {
    a.set((s) => ({ krs: s.krs.map((o, i) => i !== 1 ? o : { ...o, krs: o.krs.map((k, j) => j !== 1 ? k : { ...k, cur: 83 }) }) }))
    a.feed('AG', 'Speed-to-lead agent checked in “Emergencies answered within 60 min” · 83%')
    a.toast('Key result moved · 81% → 83%')
  } },
  { at: 11400, run: (a) => { a.go('strategy'); a.set({ autoplay: false }) } },
]

export const introFeed = (who: string, text: string): FeedItem => ({ who, agent: who === 'AG', text, when: 'just now', at: Date.now() })
