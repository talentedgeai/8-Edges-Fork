import type { Page, Person, Portal, Tone } from './types'

// ── Relative dates ───────────────────────────────────────────────────────────
// Every date in the sample company is computed from today, so the demo never
// shows an invoice that went overdue in a year that has already passed.
export function day(n: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}
export const fmt = (n: number) => day(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export const fmtY = (n: number) => day(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const weekday = (n: number) => day(n).toLocaleDateString('en-GB', { weekday: 'short' })
export function range(a: number, b: number): string {
  const A = day(a), B = day(b)
  return A.getMonth() === B.getMonth() ? `${A.getDate()} – ${fmt(b)}` : `${fmt(a)} – ${fmt(b)}`
}
export function quarter() {
  const d = new Date(), q = Math.floor(d.getMonth() / 3) + 1
  const start = new Date(d.getFullYear(), (q - 1) * 3, 1)
  const week = Math.min(13, Math.max(1, Math.ceil((d.getTime() - start.getTime()) / (7 * 86400000))))
  return { label: `Q${q} ${d.getFullYear()}`, short: `Q${q}`, week }
}
export const usd = (n: number) => '$' + n.toLocaleString('en-US')
export const initials = (name: string) => name.split(' ').map((x) => x[0]).join('')

// ── Status → tone ────────────────────────────────────────────────────────────
const TONE_OF: Record<string, Tone> = {
  Discovery: 'neutral', Proposal: 'info', Negotiation: 'warn', Won: 'ok', Lost: 'err',
  new: 'neutral', attempting: 'warn', connected: 'info', scheduled: 'info', done: 'ok',
  Confirmed: 'ok', Probation: 'warn',
  approved: 'ok', requested: 'warn', denied: 'err', taken: 'neutral', paid: 'ok', sent: 'info', overdue: 'err',
  ok: 'ok', skipped: 'warn', running: 'warn', 'on track': 'ok', 'at risk': 'warn', 'off track': 'err',
  Applied: 'neutral', 'Phone Screen': 'info', 'Ride-Along': 'warn', Offer: 'ok', Hired: 'ok',
  build: 'info', learning: 'neutral', human: 'neutral', blended: 'info', agent: 'ok',
  draft: 'neutral', sending: 'warn', active: 'ok',
}
export const toneOf = (k: string): Tone => TONE_OF[k] ?? 'neutral'

// ── The company ──────────────────────────────────────────────────────────────
export const STRATEGY = {
  year: 2026,
  title: 'Grow commercial, keep the 60-minute promise',
  body: 'Two bets for 2026: push commercial past a third of the book, and never let the emergency response time slip while we scale the crew.',
}
export const VALUES = [
  { title: 'Honest pricing', body: 'The price we quote is the price you pay. No hourly meters, no surprise line items.' },
  { title: 'Craft over volume', body: 'We do three things and do them exceptionally. Specialists, not generalists.' },
  { title: 'Respect the home', body: 'Shoe covers, drop cloths, and a job site cleaner than we found it.' },
  { title: 'Answer the phone', body: 'A real plumber on the line 24/7. Water doesn\'t wait for business hours.' },
]
export const SERVICES = ['Drain Cleaning', 'Water Heaters', 'Emergency Repair', 'Commercial & New Construction']

export const PEOPLE: Person[] = [
  { name: 'Ray Truesdale', role: 'Owner / Master Plumber', dept: 'Office', mgr: '—', since: 'Jan 1989', stage: 'Confirmed', base: 'Seattle' },
  { name: 'Dana Whitfield', role: 'Dispatcher', dept: 'Office', mgr: 'Ray Truesdale', since: 'May 2015', stage: 'Confirmed', base: 'Seattle' },
  { name: 'Chuck Bearden', role: 'Master Plumber', dept: 'Field Service', mgr: 'Ray Truesdale', since: 'Mar 2012', stage: 'Confirmed', base: 'Seattle' },
  { name: 'Denny Okafor', role: 'Journeyman Plumber', dept: 'Field Service', mgr: 'Chuck Bearden', since: 'Jun 2018', stage: 'Confirmed', base: 'Seattle' },
  { name: 'Lena Vu', role: 'Journeyman Plumber', dept: 'Field Service', mgr: 'Chuck Bearden', since: 'Sep 2020', stage: 'Confirmed', base: 'Bellevue' },
  { name: 'Marisol Ortega', role: 'Journeyman Plumber', dept: 'Field Service', mgr: 'Chuck Bearden', since: 'Apr 2022', stage: 'Confirmed', base: 'Renton' },
  { name: 'Sal Moreno', role: 'Apprentice Plumber', dept: 'Field Service', mgr: 'Chuck Bearden', since: 'Jan 2025', stage: 'Probation', base: 'Seattle' },
]
export const PLUMBERS = ['Chuck Bearden', 'Denny Okafor', 'Lena Vu', 'Marisol Ortega', 'Sal Moreno']

// Who the visitor is "signed in as" in each door.
export const PORTAL_USER: Record<Portal, { name: string; sub: string; ini: string }> = {
  admin: { name: 'Ray Truesdale', sub: 'Owner · admin portal', ini: 'RT' },
  team: { name: 'Chuck Bearden', sub: 'Master Plumber · team portal', ini: 'CB' },
  client: { name: 'Cedar Point Apartments', sub: 'Facilities · client portal', ini: 'CP' },
}

export const PAGE_PORTAL: Record<Page, Portal> = {
  strategy: 'admin', goals: 'admin', dashboard: 'admin', deals: 'admin', leads: 'admin', dispatch: 'admin', team: 'admin',
  candidates: 'admin', timeoff: 'admin', invoices: 'admin', marketing: 'admin', innovation: 'admin', agents: 'admin', results: 'admin',
  'my-week': 'team', 'my-goals': 'team', 'team-ideas': 'team',
  hub: 'client', 'client-invoices': 'client', requests: 'client',
}

export const URL_PATH: Record<Page, string> = {
  strategy: '/admin/company/strategy', goals: '/admin/company/goals', dashboard: '/admin', results: '/admin/edges/results',
  deals: '/admin/revenue/deals', leads: '/admin/revenue/leads', marketing: '/admin/revenue/marketing/campaigns',
  dispatch: '/admin/boards/service-dispatch', team: '/admin/talent/team', candidates: '/admin/talent/candidate-pool',
  timeoff: '/admin/operations/time-off/requests', invoices: '/admin/revenue/invoices', innovation: '/admin/innovation',
  agents: '/admin/settings/agents',
  'my-week': '/team', 'my-goals': '/team/goals', 'team-ideas': '/team/ideas',
  hub: '/portal/hub', 'client-invoices': '/portal/invoices', requests: '/portal/requests',
}

// ── The demos ────────────────────────────────────────────────────────────────
// One tab per demo. Each pairs a feature with the value it proves; the sidebar
// shows only that demo's screens, and a screen in another door switches the
// frame to that portal by itself (PAGE_PORTAL).
export type Demo = { id: string; label: string; value: string; pages: Page[]; portals?: boolean }
export const DEMOS: Demo[] = [
  { id: 'strategy', label: 'Strategy to execution', pages: ['strategy', 'goals', 'dispatch', 'agents'],
    value: 'One plan, four objectives with owners, and a workboard that runs it. Everyone, human or agent, works from the same rows.' },
  { id: 'booking', label: 'One booking, one database', pages: ['dispatch', 'leads', 'hub'],
    value: 'A booking from the public scheduler writes the customer, the lead, the company, the job card and the invoice in one pass. Nobody re-types anything.' },
  { id: 'portals', label: 'Three portals, one truth', pages: ['my-week', 'hub', 'requests'], portals: true,
    value: 'The admin portal you just saw is one door. A plumber and a client each get their own onto the same database, and see exactly what they should.' },
  { id: 'agents', label: 'Agents run the shop', pages: ['agents', 'timeoff', 'invoices'],
    value: '13 scheduled routines and an assistant that reads every table. The repetitive work is handed off; a human taps approve.' },
  { id: 'customers', label: 'Win and keep customers', pages: ['leads', 'deals', 'marketing'],
    value: 'A 60-minute clock on every request, a 360 on every quote, and a campaign to the customers you already have. One CRM, no exports.' },
  { id: 'crew', label: 'Grow the crew', pages: ['team', 'candidates', 'innovation'],
    value: 'Two open reqs screened by AI before a human opens them, and a backlog where the crew turns ideas into shipped changes.' },
]
export const PAGE_LABEL: Record<Page, string> = {
  strategy: 'Strategy & Values', goals: 'Company Goals', dashboard: 'Company Dashboard', results: 'Results',
  deals: 'Deals', leads: 'Lead queue', dispatch: 'Workboard', team: 'Team', candidates: 'Candidate Pool',
  timeoff: 'Time Off', invoices: 'Invoices', marketing: 'Marketing', innovation: 'Innovation', agents: 'Agents',
  'my-week': 'My Week', 'my-goals': 'My Goals', 'team-ideas': 'Ideas',
  hub: 'Client Hub', 'client-invoices': 'Invoices', requests: 'Requests',
}
export const SANDBOX_URL = 'https://www.8edges.app'

export const ALSO_IN_THE_BOX = [
  'Workboards & sprints', 'Org chart · Core values', 'Companies · Contacts · Inquiries', 'Broadcasts · Brands · Content calendar',
  'Orders · Products · Events', 'Onboarding · Probation · Reviews', 'Coaching cycle · 1-1s', 'Contractors & payments',
  'Equipment · Vendors · Surveys', 'Client roadmaps · Documents', 'Analytics', 'Admins · Assume · Pipelines',
]
