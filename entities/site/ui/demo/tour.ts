import { quarter } from './data'
import type { DemoActions } from './useDemo'
import type { DemoState, Page } from './types'

// Page headers and the "Try:" shortcuts under each demo tab. Kept out of the
// shell component so the shell stays a thin composition.

const STRAT_YEAR = 2026

export function heads(s: DemoState): Record<Page, [string, string, string]> {
  const Q = quarter()
  return {
    strategy: ['Company · TrueFlow Plumbing Co.', 'Strategy & Values', `${STRAT_YEAR} strategy, four values, ${s.krs.length} objectives for ${Q.label}. The whole company reads from this page.`],
    goals: ['Company', 'Company Goals', `${Q.label} · week ${Q.week} of 13 · one objective per office, owners on every key result`],
    dashboard: ['Company OS', 'Company Dashboard', 'The company at a glance, one panel per office. Open a cockpit for the full picture.'],
    results: ['Edges', 'Results', 'What the owner sees every morning, and what you changed in the last few minutes.'],
    leads: ['Revenue · CRM', 'Lead queue', 'Service requests land here in seconds from the website scheduler and the client portal. The 60-minute clock starts on arrival.'],
    deals: ['Revenue · CRM', 'Deals', 'Every open quote, owner and next step. Click a row for the 360.'],
    marketing: ['Revenue · Marketing', 'Campaigns & satisfaction', 'One campaign to the residential book, and the survey the agents send after every job.'],
    dispatch: ['Operations · Boards', 'Workboard', 'This week\'s service calls across five vans. Booked from the website, assigned by skill and load, invoiced when done.'],
    team: ['Talent · People', 'Team', '7 people. The same rows dispatch, coaching and payroll agents read.'],
    candidates: ['Talent · ATS', 'Candidate Pool', 'Two open plumber reqs. Every applicant extracted and scored by AI before a human opens it.'],
    timeoff: ['Operations', 'Time Off', 'Under 3 days Dana approves; longer requests wait for you. Dispatch sees every approved gap.'],
    invoices: ['Operations · Finance', 'Invoices', `Live from QuickBooks · last sync ${s.qboLast}`],
    innovation: ['Innovation', 'Innovation cockpit', 'Crew ideas, lessons from the field, and how much of the work AI already carries.'],
    agents: ['Settings', 'Agents', '13 routines on Vercel and the shop Mac mini. Every run is logged. Showing 10.'],
    'my-week': ['Team portal · Chuck Bearden', 'My Week', 'Your route, your apprentice, your leave. Same cards dispatch is looking at.'],
    'my-goals': ['Team portal · Chuck Bearden', 'My Goals', 'The key results with your name on them, and the ones your work moves.'],
    'team-ideas': ['Team portal · Chuck Bearden', 'Ideas', 'Log a build idea or a lesson from a job. The owner votes on the same list.'],
    hub: ['Client portal · Cedar Point Apartments', 'Client Hub', 'Your project roadmap, your service visits and your TrueFlow team, live from their database.'],
    'client-invoices': ['Client portal · Cedar Point Apartments', 'Invoices', 'Every invoice TrueFlow has raised for you, straight from their books.'],
    requests: ['Client portal · Cedar Point Apartments', 'Requests', 'Tell TrueFlow what you need. It lands in their queue with a clock on it.'],
  }
}

export type TryAction = { label: string; run: () => void }

export function tryActions(demo: string, s: DemoState, a: DemoActions): TryAction[] {
  const byDemo: Record<string, TryAction[]> = {
    strategy: [
      { label: 'Check in on a key result', run: () => { a.go('goals'); a.editKr('1-0', '62') } },
      { label: 'Ask which value is at risk', run: () => a.ask('Which value is at risk?') },
    ],
    booking: [
      { label: 'Book a service call from the public scheduler', run: () => { a.go('dispatch'); a.openBooking(true) } },
      { label: 'See it land in the client hub', run: () => a.go('hub') },
    ],
    portals: [
      { label: 'Finish a job as the plumber', run: () => { a.go('my-week'); const j = s.jobs.find((x) => x.plumber === 'Chuck Bearden' && x.col === 'in_progress'); if (j) a.moveJob(j.id); else a.toast('Nothing on site right now') } },
      { label: 'Raise a request as the client', run: () => { a.go('requests'); a.setRequestDraft('Unit 22C: no hot water since this morning') } },
    ],
    agents: [
      { label: 'Ask what needs a decision', run: () => a.ask('What needs my decision today?') },
      { label: 'Approve the pending leave', run: () => { a.go('timeoff'); const r = s.requests.find((x) => x.status === 'requested'); if (r) a.decide(r.id, 'approved'); else a.toast('Nothing pending') } },
      { label: 'Sync QuickBooks', run: () => { a.go('invoices'); a.syncQbo() } },
    ],
    customers: [
      { label: 'Book a site visit for the lead past SLA', run: () => { a.go('leads'); const l = s.leads.find((x) => x.slaMins < 0); if (l) a.leadAction(l.id, 'book'); else a.toast('Queue is clear') } },
      { label: 'Open the Cedar Point riser quote', run: () => { a.go('deals'); a.openDrawer(s.deals.findIndex((d) => d.company === 'Cedar Point Apartments')) } },
      { label: 'Send Beat the Freeze to 50 customers', run: () => { a.go('marketing'); a.sendCampaign() } },
    ],
    crew: [
      { label: 'Move Nadia Oyelaran to Offer', run: () => { a.go('candidates'); const i = s.candidates.findIndex((c) => c.name === 'Nadia Oyelaran'); if (i >= 0) a.advanceCandidate(i) } },
      { label: 'Add an idea to the backlog', run: () => { a.go('innovation'); a.setIdeaDraft('Auto-schedule the annual backflow test 30 days before the cert expires') } },
    ],
  }
  return byDemo[demo] ?? []
}
