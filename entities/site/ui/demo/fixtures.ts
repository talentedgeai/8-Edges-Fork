import { fmt, fmtY, range, weekday } from './data'
import type {
  Candidate, ClientRequest, Deal, DemoState, FeedItem, Idea, Invoice, Job, Lead, LeaveRequest, Objective, Routine,
} from './types'

// Seed rows for the demo. Deals, leads, candidates, time off, ideas and
// clients match scripts/demo-seed/sections/*.sql in the 8-Edges-Plumbing-Demo
// repo (amounts in dollars, stages inferred from probability), so the demo and
// the live sandbox at 8edges.app describe the same TrueFlow Plumbing Co.

function seedDeals(): Deal[] {
  return [
    { name: '48-unit riser replacement', company: 'Cedar Point Apartments', stage: 'Negotiation', amount: 86000, owner: 'Ray Truesdale', close: fmtY(20),
      next: 'Send revised scope with PEX instead of copper; the property manager signs after the board call Thursday.',
      activity: [{ text: 'Quote v3 sent · opened 4×', when: '2 days ago', tone: 'info' }, { text: 'Camera survey · stacks A–D', when: '9 days ago', tone: 'ok' }, { text: 'Inbound after the Building A emergency leak', when: '34 days ago', tone: 'neutral' }] },
    { name: 'Annual backflow + drain contract', company: 'Harborview Property Group', stage: 'Proposal', amount: 24000, owner: 'Ray Truesdale', close: fmtY(14),
      next: 'Follow up on budget approval after their ownership meeting; include quarterly drain jetting.',
      activity: [{ text: 'Proposal sent', when: '5 days ago', tone: 'info' }, { text: 'Asset inventory · all 6 buildings', when: '12 days ago', tone: 'ok' }] },
    { name: 'Northgate townhomes rough-in (12 units)', company: 'Rainier Ridge General Contractors', stage: 'Discovery', amount: 142000, owner: 'Ray Truesdale', close: fmtY(45),
      next: 'Price from the plan set; confirm the fixture schedule with the GC.',
      activity: [{ text: 'Plan set received', when: '3 days ago', tone: 'ok' }, { text: 'Referral from Cedar Point', when: '8 days ago', tone: 'neutral' }] },
    { name: 'Boiler + recirc retrofit', company: 'The Fremont Foundry Hotel', stage: 'Proposal', amount: 58000, owner: 'Dana Whitfield', close: fmtY(38),
      next: 'Hotel wants the work done between check-out and check-in; propose two overnight windows.',
      activity: [{ text: 'Proposal sent', when: '4 days ago', tone: 'info' }, { text: 'Satisfaction survey trending down · at-risk account', when: '6 days ago', tone: 'err' }] },
    { name: 'Restroom remodel re-pipe', company: 'Grace Fellowship Church', stage: 'Negotiation', amount: 32000, owner: 'Dana Whitfield', close: fmtY(25),
      next: 'Confirm the fellowship hall schedule around Sunday services.',
      activity: [{ text: 'Contract draft sent', when: '1 day ago', tone: 'info' }, { text: 'Referral from Lakeside Montessori', when: '7 days ago', tone: 'ok' }] },
    { name: 'Grease line + hydro-jet contract', company: 'Emerald City Chophouse', stage: 'Won', amount: 18500, owner: 'Dana Whitfield', close: fmtY(-12),
      next: 'Quarterly jetting programme scheduled; first visit booked.',
      activity: [{ text: 'Signed · deposit paid', when: '12 days ago', tone: 'ok' }] },
    { name: 'Water heater bank replacement', company: 'Lakeside Montessori School', stage: 'Won', amount: 21000, owner: 'Ray Truesdale', close: fmtY(-30),
      next: 'Installed over the mid-term break; final invoice paid.',
      activity: [{ text: 'Signed · paid in full', when: '30 days ago', tone: 'ok' }] },
    { name: 'Emergency sewer repair', company: 'Pike & Pine Bistro', stage: 'Lost', amount: 9800, owner: 'Dana Whitfield', close: fmtY(-8),
      next: 'Lost to a competitor on price. Lateral repair still recommended; revisit in the spring.',
      activity: [{ text: 'Lost · competitor', when: '8 days ago', tone: 'err' }, { text: 'Emergency stabilisation completed', when: '20 days ago', tone: 'ok' }] },
  ]
}

const LEADS: Lead[] = [
  { id: 1, name: 'Dolores Hatch', company: 'Ballard homeowner', subject: 'Recurring kitchen backup · website enquiry', slaMins: -60, status: 'new', attempts: 0 },
  { id: 2, name: 'Faye Mercer', company: 'Queen Anne homeowner', subject: 'No hot water, 15-year-old tank', slaMins: -60, status: 'attempting', attempts: 1 },
  { id: 3, name: 'Pramod Iyer', company: 'Wallingford homeowner', subject: 'Slab leak, needs assessment', slaMins: 240, status: 'attempting', attempts: 0 },
  { id: 4, name: 'Alma Bright', company: 'Alma\'s Cafe', subject: 'Cafe grease trap servicing', slaMins: 240, status: 'new', attempts: 0 },
  { id: 5, name: 'Wesley Combe', company: 'Fremont homeowner', subject: 'New water heater quote, tankless', slaMins: 1200, status: 'new', attempts: 2 },
  { id: 6, name: 'Georgia Pines', company: 'Pines Property Management', subject: 'Multi-unit backflow testing', slaMins: 1200, status: 'new', attempts: 1 },
  { id: 7, name: 'Curtis Ndlovu', company: 'Beacon Hill homeowner', subject: 'Sewer smell in basement', slaMins: 240, status: 'connected', attempts: 2 },
]

const CANDIDATES: Candidate[] = [
  { name: 'Nadia Oyelaran', note: '9 yrs · journeyman card · hospital and hotel service', role: 'Journeyman Plumber', score: 93, stage: 'Ride-Along' },
  { name: 'Wade Fenner', note: '7 yrs · commercial repipes · Cedar Point profile', role: 'Journeyman Plumber', score: 88, stage: 'Phone Screen' },
  { name: 'Kim Alarie', note: '6 yrs · restaurant grease lines and jetting', role: 'Journeyman Plumber', score: 86, stage: 'Phone Screen' },
  { name: 'Bruno Castellano', note: '5 yrs · residential service · wants commercial', role: 'Journeyman Plumber', score: 79, stage: 'Applied' },
  { name: 'Toby Ellison', note: 'Trade school grad · 400 hrs logged', role: 'Apprentice Plumber', score: 84, stage: 'Ride-Along' },
  { name: 'Mira Sokol', note: '2 yrs as a helper · wants her card', role: 'Apprentice Plumber', score: 77, stage: 'Applied' },
  { name: 'Junior Amaya', note: 'Career switch from HVAC install', role: 'Apprentice Plumber', score: 64, stage: 'Applied' },
]

const REQUESTS: LeaveRequest[] = [
  { id: 1, name: 'Denny Okafor', type: 'Vacation', range: range(7, 11), days: '5 days', reason: 'Camping trip', status: 'requested' },
  { id: 2, name: 'Sal Moreno', type: 'Personal day', range: fmt(6), days: '1 day', reason: 'DMV appointment', status: 'requested' },
  { id: 3, name: 'Lena Vu', type: 'Vacation', range: range(3, 5), days: '3 days', reason: 'Long weekend', status: 'approved' },
  { id: 4, name: 'Chuck Bearden', type: 'Personal day', range: fmt(-2), days: '1 day', reason: 'Family matter', status: 'approved' },
  { id: 5, name: 'Marisol Ortega', type: 'Sick leave', range: fmt(-9), days: '1 day', reason: 'Flu', status: 'taken' },
]

const INVOICES: Invoice[] = [
  { no: 'INV-2041', client: 'Cedar Point Apartments', amount: 14800, due: fmt(-12), status: 'overdue', over: 12 },
  { no: 'INV-2046', client: 'Emerald City Chophouse', amount: 3650, due: fmt(-6), status: 'overdue', over: 6 },
  { no: 'INV-2049', client: 'Grace Fellowship Church', amount: 2200, due: fmt(-3), status: 'overdue', over: 3 },
  { no: 'INV-2051', client: 'The Fremont Foundry Hotel', amount: 27500, due: fmt(13), status: 'sent' },
  { no: 'INV-2052', client: 'Cedar Point Apartments', amount: 1890, due: fmt(9), status: 'sent' },
  { no: 'INV-2050', client: 'Lakeside Montessori School', amount: 21000, due: fmt(-6), status: 'paid' },
]

const IDEAS: Idea[] = [
  { title: 'Text customers a live arrival tracker', by: 'Dana Whitfield · Dispatch', office: 'Operations', kind: 'build', votes: 14 },
  { title: 'Annual maintenance membership plan', by: 'Ray Truesdale', office: 'Revenue', kind: 'build', votes: 11 },
  { title: 'Water heater installs run 45 min over when the old unit sits in a crawlspace', by: 'Chuck Bearden · Field', office: 'Operations', kind: 'learning', votes: 8 },
  { title: 'Tablet job-photo capture on every visit', by: 'Marisol Ortega · Field', office: 'Operations', kind: 'build', votes: 7 },
  { title: 'Add water-quality testing service', by: 'Lena Vu · Field', office: 'Revenue', kind: 'build', votes: 5 },
  { title: 'Apprentice ride-along scheduling tool', by: 'Sal Moreno · Field', office: 'Talent', kind: 'learning', votes: 4 },
]

const ROUTINES: Routine[] = [
  { name: 'Speed-to-lead nudge', office: 'Revenue', schedule: 'Every 15 min', status: 'ok', last: '6 min ago', reported: '2 leads inside 30 min of SLA · Dana pinged' },
  { name: 'Email campaign send', office: 'Revenue · Marketing', schedule: 'Every 15 min', status: 'skipped', last: '9 min ago', reported: 'No campaign due' },
  { name: 'QuickBooks invoice sync', office: 'Operations', schedule: 'Every 6 h', status: 'ok', last: '14 min ago', reported: '3 invoices updated, Lakeside Montessori marked paid' },
  { name: 'Dispatch digest', office: 'Operations', schedule: 'Daily 17:30', status: 'ok', last: 'Yesterday 17:30', reported: '11 jobs tomorrow, 5 vans, one 2 pm gap on Denny\'s route' },
  { name: 'Application screener', office: 'Talent', schedule: 'Hourly', status: 'ok', last: '38 min ago', reported: '1 résumé extracted and scored · Bruno Castellano 79' },
  { name: 'Coaching cycle', office: 'Talent', schedule: 'Hourly', status: 'ok', last: '52 min ago', reported: 'Sal Moreno ride-along check-in nudged, recap sent to Chuck' },
  { name: 'Probation reviews', office: 'Talent', schedule: 'Daily 06:30', status: 'ok', last: 'Today 06:30', reported: 'Sal Moreno review due in 9 days · Chuck notified' },
  { name: 'Ideas digest', office: 'Innovation', schedule: 'Weekly · Mon', status: 'ok', last: 'Mon 07:30', reported: '3 new ideas summarised to the crew channel' },
  { name: 'Satisfaction survey send', office: 'Revenue', schedule: 'Daily 18:00', status: 'ok', last: 'Yesterday 18:00', reported: '9 post-service surveys sent · 6 answered · avg 4.7' },
  { name: 'Contractor payments', office: 'Operations', schedule: 'Monthly · 1st', status: 'skipped', last: fmt(-6), reported: 'Nothing due until the 1st' },
]

const FEED: FeedItem[] = [
  { who: 'AG', agent: true, text: 'Speed-to-lead nudge: Dolores Hatch is past SLA · Dana pinged in Lark', when: '6 min ago' },
  { who: 'DW', text: 'Dana Whitfield logged a call with Curtis Ndlovu · sewer smell, camera visit booked', when: '11 min ago' },
  { who: 'AG', agent: true, text: 'QuickBooks sync: 3 invoices updated, Lakeside Montessori marked paid', when: '14 min ago' },
  { who: 'CB', text: 'Chuck Bearden moved “Fremont Foundry · boiler inspection” to In progress', when: '32 min ago' },
  { who: 'AG', agent: true, text: 'Application screener scored Bruno Castellano 79 · summary attached', when: '38 min ago' },
  { who: 'RT', text: `Ray Truesdale approved Lena Vu's vacation · ${range(3, 5)}`, when: '1 h ago' },
]

const JOBS: Job[] = [
  { id: 'J-1041', title: 'Boiler inspection · pre-retrofit', customer: 'The Fremont Foundry Hotel', service: 'Commercial', plumber: 'Chuck Bearden', col: 'in_progress', when: `${weekday(0)} 08:00`, amount: 450 },
  { id: 'J-1042', title: 'Unit 14B leak', customer: 'Cedar Point Apartments', service: 'Emergency Repair', plumber: 'Denny Okafor', col: 'in_progress', when: `${weekday(0)} 09:30`, amount: 225 },
  { id: 'J-1043', title: 'Floor drain · hydro-jet', customer: 'Pike & Pine Bistro', service: 'Drain Cleaning', plumber: 'Lena Vu', col: 'in_progress', when: `${weekday(0)} 10:00`, amount: 450 },
  { id: 'J-1044', title: 'Quarterly jetting · building 2', customer: 'Harborview Property Group', service: 'Drain Cleaning', plumber: 'Marisol Ortega', col: 'scheduled', when: `${weekday(0)} 13:00`, amount: 450 },
  { id: 'J-1045', title: 'Backflow test · 2 devices', customer: 'Queen Anne Dental', service: 'Commercial', plumber: 'Marisol Ortega', col: 'scheduled', when: `${weekday(1)} 09:00`, amount: 240 },
  { id: 'J-1046', title: 'Tankless install', customer: 'Ballard Residence', service: 'Water Heaters', plumber: 'Chuck Bearden', col: 'scheduled', when: `${weekday(1)} 08:00`, amount: 4200 },
  { id: 'J-1047', title: 'Camera inspection', customer: 'Beacon Hill Residence', service: 'Drain Cleaning', plumber: 'Denny Okafor', col: 'scheduled', when: `${weekday(1)} 14:00`, amount: 150 },
  { id: 'J-1039', title: 'Grease line baseline · jetting', customer: 'Emerald City Chophouse', service: 'Drain Cleaning', plumber: 'Lena Vu', col: 'done', when: `${weekday(-1)}`, amount: 450 },
  { id: 'J-1040', title: 'Water heater repair', customer: 'Green Lake Residence', service: 'Water Heaters', plumber: 'Sal Moreno', col: 'done', when: `${weekday(-1)}`, amount: 285 },
]

const CLIENT_REQUESTS: ClientRequest[] = [
  { id: 1, title: 'Unit 14B · leak under the kitchen sink', by: 'Cedar Point facilities', when: fmt(0), status: 'scheduled' },
  { id: 2, title: 'Laundry room drains slow · Building A', by: 'Cedar Point facilities', when: fmt(-4), status: 'done' },
]

function seedKrs(): Objective[] {
  return [
    { office: 'Revenue', title: 'Grow commercial revenue to 35% of the book', health: 'at risk', krs: [
      { title: 'Commercial revenue share', cur: 22, target: 35, unit: '%', mix: 'human', owner: 'RT', ownerTitle: 'Ray Truesdale' },
      { title: 'Commercial deals won this quarter', cur: 3, target: 6, unit: '', mix: 'blended', owner: 'DW', ownerTitle: 'Dana Whitfield' } ] },
    { office: 'Operations', title: 'Keep the 60-minute emergency promise', health: 'on track', krs: [
      { title: 'Avg emergency response', cur: 62, target: 55, unit: 'min', mix: 'blended', owner: 'DW', ownerTitle: 'Dana Whitfield', down: true },
      { title: 'Emergencies answered within 60 min', cur: 81, target: 90, unit: '%', mix: 'agent', owner: 'AG', ownerTitle: 'Speed-to-lead agent' } ] },
    { office: 'Talent', title: 'Build the apprentice pipeline', health: 'at risk', krs: [
      { title: 'Apprentices on the roster', cur: 1, target: 3, unit: '', mix: 'human', owner: 'CB', ownerTitle: 'Chuck Bearden' },
      { title: 'Applications screened by AI within 24 h', cur: 100, target: 100, unit: '%', mix: 'agent', owner: 'AG', ownerTitle: 'Application screener' } ] },
    { office: 'Innovation', title: 'Half of all key results executed by agents', health: 'off track', krs: [
      { title: 'Key results with agent or blended delivery', cur: 46, target: 50, unit: '%', mix: 'human', owner: 'RT', ownerTitle: 'Ray Truesdale' },
      { title: 'Crew ideas turned into shipped changes', cur: 4, target: 6, unit: '', mix: 'blended', owner: 'DW', ownerTitle: 'Dana Whitfield' } ] },
  ]
}

export function seedState(): DemoState {
  return {
    portal: 'admin', page: 'strategy', demo: 'strategy', drawer: null, chatOpen: false, typing: false, chatInput: '',
    messages: [{ role: 'a', text: 'Hi Ray. I read every table in TrueFlow\'s company database and, with your OK, write to it. Ask about jobs, quotes, crews, leave, invoices or hiring — or tap a suggestion.' }],
    deals: seedDeals(), krs: seedKrs(), editingKr: null, krDraft: '',
    leads: LEADS, jobs: JOBS, bookingOpen: false, bookingBusy: false, writes: [],
    candidates: CANDIDATES, requests: REQUESTS, invoices: INVOICES,
    qboState: 'idle', qboLast: '14 min ago', campaign: 'draft',
    ideas: IDEAS, ideaDraft: '', voted: {},
    routines: ROUTINES, runningIdx: null, tick: 0, feed: FEED,
    clientRequests: CLIENT_REQUESTS, requestDraft: '', actions: [], startedAt: Date.now(), autoplay: false,
    toast: null, navOpen: false,
  }
}
