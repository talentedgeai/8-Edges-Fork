// Shape of the sample company the interactive demo runs on. Everything here is
// fixture data held in React state: the demo never touches Supabase, it only
// shows what the three portals look like with a real company's worth of rows.
// Names, clients, deals and dates mirror scripts/demo-seed in the
// 8-Edges-Plumbing-Demo repo, so this demo and the live sandbox tell one story.

export type Portal = 'admin' | 'team' | 'client'

export type Page =
  // admin
  | 'strategy'
  | 'goals'
  | 'dashboard'
  | 'deals'
  | 'leads'
  | 'dispatch'
  | 'team'
  | 'candidates'
  | 'timeoff'
  | 'invoices'
  | 'marketing'
  | 'innovation'
  | 'agents'
  | 'results'
  // team portal (signed in as Chuck Bearden, journeyman plumber)
  | 'my-week'
  | 'my-goals'
  | 'team-ideas'
  // client portal (signed in as the Cedar Point Apartments facilities contact)
  | 'hub'
  | 'client-invoices'
  | 'requests'

export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'neutral'

export type Activity = { text: string; when: string; tone: Tone }

export type DealStage = 'Discovery' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
export type Deal = {
  name: string
  company: string
  stage: DealStage
  amount: number
  owner: string
  close: string
  next: string
  activity: Activity[]
}

export type Lead = {
  id: number
  name: string
  company: string
  subject: string
  slaMins: number
  status: 'new' | 'attempting' | 'connected'
  attempts: number
}

export type CandidateStage = 'Applied' | 'Phone Screen' | 'Ride-Along' | 'Offer' | 'Hired'
export type Candidate = { name: string; note: string; role: string; score: number; stage: CandidateStage }

export type LeaveRequest = {
  id: number
  name: string
  type: string
  range: string
  days: string
  reason: string
  status: 'requested' | 'approved' | 'denied' | 'taken'
}

export type Invoice = {
  no: string
  client: string
  amount: number
  due: string
  status: 'overdue' | 'sent' | 'paid'
  over?: number
}

export type Idea = { title: string; by: string; office: string; kind: 'build' | 'learning'; votes: number }

export type Routine = {
  name: string
  office: string
  schedule: string
  status: 'ok' | 'skipped'
  last: string
  reported: string
  ranAt?: number
}

export type FeedItem = { who: string; agent?: boolean; text: string; when: string; at?: number }

export type JobColumn = 'scheduled' | 'in_progress' | 'done'
export type Job = {
  id: string
  title: string
  customer: string
  service: string
  plumber: string
  col: JobColumn
  when: string
  amount: number
  fromLead?: boolean
}

export type KeyResult = {
  title: string
  cur: number
  target: number
  unit: '' | '%' | '$' | 'min' | 'd'
  mix: 'human' | 'blended' | 'agent'
  owner: string
  ownerTitle: string
  down?: boolean
}
export type Objective = { office: string; title: string; health: 'on track' | 'at risk' | 'off track'; krs: KeyResult[] }

export type Person = { name: string; role: string; dept: string; mgr: string; since: string; stage: 'Confirmed' | 'Probation'; base: string }

export type ClientRequest = { id: number; title: string; by: string; when: string; status: 'new' | 'scheduled' | 'done' }

export type Message = { role: 'a' | 'u'; text: string; action?: string | null; run?: (() => void) | null }

// One line per thing the visitor changed, so the closing stop can add it up.
export type ActionKind = 'checkin' | 'lead' | 'booking' | 'job' | 'candidate' | 'leave' | 'invoice' | 'campaign' | 'idea' | 'routine' | 'request' | 'deal'
export type ActionLog = { kind: ActionKind; text: string; at: number; amount?: number }

export type DemoState = {
  portal: Portal
  page: Page
  demo: string
  drawer: number | null
  chatOpen: boolean
  typing: boolean
  chatInput: string
  messages: Message[]
  deals: Deal[]
  krs: Objective[]
  editingKr: string | null
  krDraft: string
  leads: Lead[]
  jobs: Job[]
  bookingOpen: boolean
  bookingBusy: boolean
  writes: string[]
  candidates: Candidate[]
  requests: LeaveRequest[]
  invoices: Invoice[]
  qboState: 'idle' | 'syncing'
  qboLast: string
  campaign: 'draft' | 'sending' | 'sent'
  ideas: Idea[]
  ideaDraft: string
  voted: Record<number, boolean>
  routines: Routine[]
  runningIdx: number | null
  tick: number
  feed: FeedItem[]
  clientRequests: ClientRequest[]
  requestDraft: string
  actions: ActionLog[]
  startedAt: number
  autoplay: boolean
  toast: { text: string; link: string | null; page: Page | null } | null
  navOpen: boolean
}
