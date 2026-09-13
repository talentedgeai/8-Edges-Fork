'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEMOS, PAGE_PORTAL, PLUMBERS, fmt, usd } from './data'
import { seedState } from './fixtures'
import { INTRO, introFeed } from './autoplay'
import { answerFreeText, dealAnswer, promptsFor, type AssistantApi, type Prompt, type PromptAction } from './prompts'
import type { ActionKind, CandidateStage, Deal, DemoState, FeedItem, Job, JobColumn, Page, Portal } from './types'

const STAGE_ORDER: Deal['stage'][] = ['Discovery', 'Proposal', 'Negotiation', 'Won']
const CAND_ORDER: CandidateStage[] = ['Applied', 'Phone Screen', 'Ride-Along', 'Offer', 'Hired']
const JOB_ORDER: JobColumn[] = ['scheduled', 'in_progress', 'done']

// Routines the background "live" tick runs every 20 seconds, so a visitor who
// leaves the page open sees the agents keep working.
const LIVE: { name: string; report: () => string; feed: (r: string) => string }[] = [
  { name: 'Speed-to-lead nudge', report: () => `${1 + Math.floor(Math.random() * 3)} leads inside 30 min of SLA · Dana pinged`, feed: (r) => `Speed-to-lead agent: ${r}` },
  { name: 'Coaching cycle', report: () => { const n = 1 + Math.floor(Math.random() * 3); return `${n} check-in${n > 1 ? 's' : ''} nudged, recap queued for Chuck` }, feed: (r) => `Coaching cycle nudged ${r.split(' nudged')[0]}` },
  { name: 'Dispatch digest', report: () => `${8 + Math.floor(Math.random() * 6)} jobs tomorrow, 5 vans, no gaps`, feed: (r) => `Dispatch digest: ${r}` },
  { name: 'QuickBooks invoice sync', report: () => '0 changes · books match', feed: () => 'QuickBooks sync ran · books match' },
]

// The six writes one public booking makes. Shown one by one on the dispatch
// board so the visitor sees the "one database" claim rather than reading it.
const BOOKING_WRITES = [
  'company_os.people · customer created',
  'company_os.bookings · slot held, plumber auto-assigned',
  'company_os.inquiries · request logged',
  'company_os.lead · SLA clock started',
  'company_os.companies · customer account linked',
  'company_os.tasks · job card on Service Dispatch',
]

export function ago(at: number | undefined, fallback: string): string {
  if (!at) return fallback
  const m = Math.round((Date.now() - at) / 60000)
  return m < 1 ? 'just now' : `${m} min ago`
}

type Patch = Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)

export function useDemo() {
  const [state, setState] = useState<DemoState>(seedState)
  // Timers and the assistant read the latest state without re-binding on every
  // render, so the callbacks below can stay referentially stable.
  const ref = useRef(state)
  ref.current = state
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const set = useCallback((patch: Patch) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  }, [])

  const toast = useCallback((text: string, link?: string, page?: Page) => {
    clearTimeout(timers.current.toast)
    set({ toast: { text, link: link ?? null, page: page ?? null } })
    timers.current.toast = setTimeout(() => set({ toast: null }), link ? 4500 : 2800)
  }, [set])

  const logFeed = useCallback((who: string, text: string) => {
    const item: FeedItem = { who, agent: who === 'AG', text, when: 'just now', at: Date.now() }
    set((s) => ({ feed: [item, ...s.feed].slice(0, 7) }))
  }, [set])

  const logAction = useCallback((kind: ActionKind, text: string, amount?: number) => {
    set((s) => ({ actions: [...s.actions, { kind, text, at: Date.now(), amount }] }))
  }, [set])

  // Moving to a page outside the current demo also moves the tab, so the
  // sidebar and the caption always describe what is on screen.
  const go = useCallback((page: Page, extra?: Partial<DemoState>) => {
    set((s) => {
      const cur = DEMOS.find((d) => d.id === s.demo)
      const demo = cur?.pages.includes(page) ? s.demo : (DEMOS.find((d) => d.pages.includes(page))?.id ?? s.demo)
      return { page, portal: PAGE_PORTAL[page], demo, drawer: null, navOpen: false, ...extra }
    })
  }, [set])

  // Inside a demo, switching door lands on that demo's screen for the door.
  const setPortal = useCallback((portal: Portal) => {
    set((s) => {
      const demo = DEMOS.find((d) => d.id === s.demo)
      const page = demo?.pages.find((p) => PAGE_PORTAL[p] === portal) ?? s.page
      return { portal, page, drawer: null, navOpen: false }
    })
  }, [set])

  const setDemo = useCallback((id: string) => {
    const d = DEMOS.find((x) => x.id === id)
    if (d) set({ demo: id, page: d.pages[0], portal: PAGE_PORTAL[d.pages[0]], drawer: null, navOpen: false, bookingOpen: false })
  }, [set])

  const editKr = useCallback((key: string | null, draft = '') => set({ editingKr: key, krDraft: draft }), [set])
  const setKrDraft = useCallback((krDraft: string) => set({ krDraft }), [set])
  const saveKr = useCallback((oi: number, ki: number) => {
    const v = parseFloat(ref.current.krDraft)
    if (Number.isNaN(v)) return
    const k = ref.current.krs[oi]?.krs[ki]
    set((s) => ({ krs: s.krs.map((o, a) => a !== oi ? o : { ...o, krs: o.krs.map((x, b) => b !== ki ? x : { ...x, cur: v }) }), editingKr: null }))
    toast('Check-in saved · dashboard health updated', 'See dashboard', 'dashboard')
    logFeed('RT', `Ray Truesdale checked in on “${k?.title}” · ${v}${k?.unit ?? ''}`)
    logAction('checkin', `Checked in on “${k?.title}”`)
  }, [set, toast, logFeed, logAction])

  const leadAction = useCallback((id: number, kind: 'call' | 'book') => {
    const l = ref.current.leads.find((x) => x.id === id)
    if (!l) return
    if (kind === 'call') {
      set((s) => ({ leads: s.leads.map((x) => x.id === id ? { ...x, attempts: x.attempts + 1, status: 'connected', slaMins: 24 * 60 } : x) }))
      toast(`Call logged · ${l.name} marked connected`)
      logFeed('DW', `Dana Whitfield logged a call with ${l.name} · ${l.company}`)
      logAction('lead', `Called ${l.name} back`)
      return
    }
    const deal: Deal = { name: `Quote · ${l.subject.split(' · ')[0]}`, company: l.company, stage: 'Discovery', amount: 0, owner: 'Dana Whitfield', close: 'TBD', next: `Site visit booked with ${l.name}.`, activity: [{ text: 'Site visit booked from the lead queue', when: 'just now', tone: 'ok' }] }
    set((s) => ({ leads: s.leads.filter((x) => x.id !== id), deals: [deal, ...s.deals] }))
    toast(`Site visit booked · ${l.company} handed off to Deals`, 'See the deal', 'deals')
    logFeed('DW', `Site visit booked with ${l.name} · new quote opened for ${l.company}`)
    logAction('lead', `Booked a site visit with ${l.name}`)
  }, [set, toast, logFeed, logAction])

  // The one-database moment: a public booking, written table by table.
  const openBooking = useCallback((open: boolean) => set({ bookingOpen: open, writes: open ? [] : ref.current.writes }), [set])
  const bookServiceCall = useCallback((customer: string, service: string) => {
    if (ref.current.bookingBusy) return
    set({ bookingBusy: true, writes: [] })
    BOOKING_WRITES.forEach((w, i) => {
      setTimeout(() => set((s) => ({ writes: [...s.writes, w] })), 350 * (i + 1))
    })
    setTimeout(() => {
      const s = ref.current
      const load = Object.fromEntries(PLUMBERS.map((p) => [p, s.jobs.filter((j) => j.plumber === p && j.col !== 'done').length]))
      const plumber = Object.entries(load).sort((a, b) => a[1] - b[1])[0][0]
      const job: Job = { id: `J-${1048 + s.actions.filter((a) => a.kind === 'booking').length}`, title: service, customer, service, plumber, col: 'scheduled', when: `${fmt(1)} 10:00`, amount: 189, fromLead: true }
      set((st) => ({ jobs: [job, ...st.jobs], bookingBusy: false, bookingOpen: false }))
      toast(`Booked · ${customer} · ${plumber} auto-assigned`, 'See the dashboard', 'dashboard')
      logFeed('AG', `Scheduler booked ${service} for ${customer} · ${plumber} · lead, company and job card created`)
      logAction('booking', `Booked ${service} for ${customer}`, job.amount)
    }, 350 * (BOOKING_WRITES.length + 1))
  }, [set, toast, logFeed, logAction])

  const moveJob = useCallback((id: string) => {
    const j = ref.current.jobs.find((x) => x.id === id)
    if (!j) return
    const ni = JOB_ORDER.indexOf(j.col) + 1
    const col = JOB_ORDER[ni] ?? 'scheduled'
    set((s) => ({ jobs: s.jobs.map((x) => x.id === id ? { ...x, col } : x) }))
    if (col === 'done') {
      const no = `INV-${2053 + ref.current.actions.filter((a) => a.kind === 'job').length}`
      set((s) => ({ invoices: [{ no, client: j.customer, amount: j.amount, due: fmt(14), status: 'sent' }, ...s.invoices] }))
      toast(`${j.title} done · ${no} drafted in QuickBooks`, 'See the dashboard', 'dashboard')
      logFeed(j.plumber.split(' ').map((x) => x[0]).join(''), `${j.plumber} completed “${j.title}” · invoice ${no} drafted`)
      logAction('job', `Completed “${j.title}” and raised ${no}`, j.amount)
    } else {
      toast(col === 'in_progress' ? `${j.plumber} is on site · ${j.customer}` : 'Card reopened')
      logFeed(j.plumber.split(' ').map((x) => x[0]).join(''), `${j.plumber} ${col === 'in_progress' ? 'started' : 'reopened'} “${j.title}”`)
    }
  }, [set, toast, logFeed, logAction])

  const advanceCandidate = useCallback((i: number) => {
    const c = ref.current.candidates[i]
    if (!c || c.stage === 'Hired') return
    const ns = CAND_ORDER[CAND_ORDER.indexOf(c.stage) + 1]
    set((s) => ({ candidates: s.candidates.map((x, a) => a !== i ? x : { ...x, stage: ns }) }))
    const note = { 'Ride-Along': 'ride-along with Chuck scheduled', Offer: 'offer letter drafted', Hired: 'onboarding cycle started' }[ns as string] ?? 'screener summary attached'
    toast(`${c.name} → ${ns} · ${note}`)
    logFeed('DW', `Dana Whitfield moved ${c.name} to ${ns}`)
    logAction('candidate', `Moved ${c.name} to ${ns}`)
  }, [set, toast, logFeed, logAction])

  const decide = useCallback((id: number, status: 'approved' | 'denied') => {
    const r = ref.current.requests.find((x) => x.id === id)
    if (!r) return
    set((s) => ({ requests: s.requests.map((x) => x.id === id ? { ...x, status } : x) }))
    toast(status === 'approved' ? `${r.name}'s leave approved · dispatch calendar + payroll updated` : `${r.name}'s request denied · they've been notified`, 'See dashboard', 'dashboard')
    logFeed('RT', `Ray Truesdale ${status} ${r.name}'s ${r.type.toLowerCase()} · ${r.range}`)
    logAction('leave', `${status === 'approved' ? 'Approved' : 'Denied'} ${r.name}'s ${r.type.toLowerCase()}`)
  }, [set, toast, logFeed, logAction])

  const syncQbo = useCallback(() => {
    if (ref.current.qboState === 'syncing') return
    set({ qboState: 'syncing' })
    clearTimeout(timers.current.qbo)
    timers.current.qbo = setTimeout(() => {
      set((s) => ({ qboState: 'idle', qboLast: 'just now', invoices: s.invoices.map((iv) => iv.no === 'INV-2049' ? { ...iv, status: 'paid', over: undefined } : iv) }))
      toast('QuickBooks synced · Grace Fellowship Church paid INV-2049', 'See dashboard', 'dashboard')
      logFeed('AG', 'QuickBooks sync: Grace Fellowship Church paid INV-2049 · $2,200')
      logAction('invoice', 'Collected $2,200 from Grace Fellowship Church', 2200)
    }, 1400)
  }, [set, toast, logFeed, logAction])

  const sendCampaign = useCallback(() => {
    if (ref.current.campaign !== 'draft') return
    set({ campaign: 'sending' })
    setTimeout(() => {
      set((s) => ({ campaign: 'sent', routines: s.routines.map((r) => r.name === 'Email campaign send' ? { ...r, status: 'ok', last: 'just now', reported: '50 sends · Beat the Freeze · 0 bounces', ranAt: Date.now() } : r) }))
      toast('Beat the Freeze sent to 50 residential customers', 'See agents', 'agents')
      logFeed('AG', 'Campaign agent sent “Beat the Freeze” to 50 residential customers · 0 bounces')
      logAction('campaign', 'Sent the Beat the Freeze campaign to 50 customers')
    }, 1600)
  }, [set, toast, logFeed, logAction])

  const setIdeaDraft = useCallback((ideaDraft: string) => set({ ideaDraft }), [set])
  const addIdea = useCallback(() => {
    const t = ref.current.ideaDraft.trim()
    if (!t) return
    const by = ref.current.portal === 'team' ? 'Chuck Bearden · just now' : 'Ray Truesdale · just now'
    set((s) => ({ ideas: [{ title: t, by, office: 'Operations', kind: 'build', votes: 1 }, ...s.ideas], ideaDraft: '' }))
    toast('Idea logged · included in Monday\'s digest')
    logFeed(by.startsWith('Chuck') ? 'CB' : 'RT', `${by.split(' · ')[0]} logged an idea: “${t}”`)
    logAction('idea', `Logged the idea “${t}”`)
  }, [set, toast, logFeed, logAction])
  const vote = useCallback((i: number) => {
    set((s) => s.voted[i] ? {} : { ideas: s.ideas.map((x, a) => a === i ? { ...x, votes: x.votes + 1 } : x), voted: { ...s.voted, [i]: true } })
  }, [set])

  const runRoutine = useCallback((i: number) => {
    if (ref.current.runningIdx != null) return
    const r = ref.current.routines[i]
    set({ runningIdx: i })
    setTimeout(() => {
      set((s) => ({ runningIdx: null, routines: s.routines.map((x, a) => a === i ? { ...x, status: 'ok', last: 'just now', ranAt: Date.now() } : x) }))
      toast(`${r.name} ran · logged to audit_log`)
      logFeed('AG', `${r.name} ran on demand · ${r.reported}`)
      logAction('routine', `Ran “${r.name}” on demand`)
    }, 1600)
  }, [set, toast, logFeed, logAction])

  const setRequestDraft = useCallback((requestDraft: string) => set({ requestDraft }), [set])
  const submitRequest = useCallback(() => {
    const t = ref.current.requestDraft.trim()
    if (!t) return
    const id = ref.current.clientRequests.length + 1
    set((s) => ({ clientRequests: [{ id, title: t, by: 'Cedar Point facilities', when: fmt(0), status: 'new' }, ...s.clientRequests], requestDraft: '' }))
    toast('Request sent · Dana sees it in the lead queue now', 'See the dashboard', 'dashboard')
    logFeed('AG', `Client portal request from Cedar Point Apartments: “${t}” · lead opened, SLA clock started`)
    logAction('request', `Cedar Point raised “${t}” from the client portal`)
    set((s) => ({ leads: [{ id: 100 + id, name: 'Cedar Point facilities', company: 'Cedar Point Apartments', subject: `${t} · client portal`, slaMins: 60, status: 'new', attempts: 0 }, ...s.leads] }))
  }, [set, toast, logFeed, logAction])

  const ask = useCallback((q: string, answer?: string, action?: PromptAction | null) => {
    if (!q.trim()) return
    set((s) => ({ messages: [...s.messages, { role: 'u', text: q }], chatInput: '', typing: true, chatOpen: true }))
    clearTimeout(timers.current.chat)
    timers.current.chat = setTimeout(() => {
      let text = answer, act = action ?? null
      if (!text) {
        const r = answerFreeText(ref.current, apiRef.current, q)
        text = r.text; act = r.action
      }
      set((s) => ({ typing: false, messages: [...s.messages, { role: 'a', text: text as string, action: act?.label ?? null, run: act?.run ?? null }] }))
    }, 1100)
  }, [set])

  // The assistant's actions call back into the hook; the ref breaks the cycle.
  const apiRef = useRef<AssistantApi>({ toast, decide, ask })
  apiRef.current = { toast, decide, ask }

  const advanceDeal = useCallback(() => {
    const s = ref.current
    if (s.drawer == null) return
    const i = s.drawer, d = s.deals[i]
    const ns = STAGE_ORDER[STAGE_ORDER.indexOf(d.stage) + 1]
    if (!ns) return
    set((st) => ({ deals: st.deals.map((x, a) => a === i ? { ...x, stage: ns, activity: [{ text: `Stage → ${ns}`, when: 'just now', tone: ns === 'Won' ? 'ok' : 'info' }, ...x.activity] } : x) }))
    toast(ns === 'Won' ? `${d.company} won · deposit invoice drafted in QuickBooks` : `${d.company} → ${ns}`)
    logFeed('RT', ns === 'Won' ? `Ray Truesdale closed ${d.company} · ${usd(d.amount)}` : `Ray Truesdale moved ${d.company} to ${ns}`)
    logAction('deal', ns === 'Won' ? `Won ${d.company} · ${usd(d.amount)}` : `Moved ${d.company} to ${ns}`, ns === 'Won' ? d.amount : undefined)
  }, [set, toast, logFeed, logAction])

  const askAboutDeal = useCallback(() => {
    const s = ref.current
    if (s.drawer == null) return
    const d = s.deals[s.drawer]
    set({ drawer: null })
    ask(`Summarise the ${d.company} quote and draft the follow-up`, dealAnswer(d), { label: 'Draft the follow-up', run: () => toast(`Follow-up drafted for ${d.company} · saved to the deal`) })
  }, [set, ask, toast])

  const remindInvoice = useCallback((no: string) => {
    const iv = ref.current.invoices.find((x) => x.no === no)
    if (!iv) return
    ask(`Draft a reminder for ${iv.client}`,
      `“Hi — a quick nudge on ${iv.no} (${usd(iv.amount)}), due ${iv.due}. The payment link is below; let us know if anything on the invoice needs changing.”\n\nRead: company_os.invoices · 1 row · company_os.companies · 1 row`,
      { label: 'Send from dana@trueflow', run: () => toast(`Reminder sent to ${iv.client} · logged on the client`) })
  }, [ask, toast])

  // Background life: agents run on a cadence, SLA clocks tick down.
  useEffect(() => {
    const liveTick = () => {
      const s = ref.current
      if (s.runningIdx != null) return
      const pick = LIVE[s.tick % LIVE.length]
      const idx = s.routines.findIndex((r) => r.name === pick.name)
      if (idx < 0) return
      set({ runningIdx: idx, tick: s.tick + 1 })
      setTimeout(() => {
        const rep = pick.report()
        set((st) => ({
          runningIdx: null,
          routines: st.routines.map((r, i) => i === idx ? { ...r, status: 'ok', last: 'just now', reported: rep, ranAt: Date.now() } : r),
          feed: [{ who: 'AG', agent: true, text: pick.feed(rep), when: 'just now', at: Date.now() }, ...st.feed].slice(0, 7),
        }))
      }, 1800)
    }
    const first = setTimeout(liveTick, 4000)
    const live = setInterval(liveTick, 20000)
    const clock = setInterval(() => set((s) => ({ leads: s.leads.map((l) => ({ ...l, slaMins: l.slaMins - 1 })) })), 60000)
    return () => { clearTimeout(first); clearInterval(live); clearInterval(clock) }
  }, [set])

  // Opening sequence. Skipped when the visitor prefers reduced motion; any
  // pointer or key event inside the frame (see DemoShell) calls stopAutoplay.
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const stopAutoplay = useCallback(() => {
    if (!introTimers.current.length) return
    introTimers.current.forEach(clearTimeout)
    introTimers.current = []
    set({ autoplay: false })
  }, [set])
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const api = {
      set,
      go: (page: Page) => set({ page, portal: PAGE_PORTAL[page], drawer: null }),
      toast: (text: string) => toast(text),
      feed: (who: string, text: string) => set((s) => ({ feed: [introFeed(who, text), ...s.feed].slice(0, 7) })),
    }
    set({ autoplay: true })
    introTimers.current = INTRO.map((step) => setTimeout(() => {
      step.run(api)
      if (step === INTRO[INTRO.length - 1]) introTimers.current = []
    }, step.at))
    return () => { introTimers.current.forEach(clearTimeout); introTimers.current = [] }
  }, [set, toast])

  const prompts: Prompt[] = useMemo(() => promptsFor(state, state.page, apiRef.current), [state])

  const actions = useMemo(() => ({
    go, setPortal, setDemo, editKr, setKrDraft, saveKr, leadAction, openBooking, bookServiceCall, moveJob, advanceCandidate, decide,
    syncQbo, sendCampaign, setIdeaDraft, addIdea, vote, runRoutine, setRequestDraft, submitRequest, ask, advanceDeal, askAboutDeal,
    remindInvoice, toast, stopAutoplay,
    openDrawer: (i: number) => set({ drawer: i }),
    closeDrawer: () => set({ drawer: null }),
    setPage: (page: Page) => set({ page, portal: PAGE_PORTAL[page], drawer: null }),
    toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
    setChatInput: (chatInput: string) => set({ chatInput }),
    toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
    toastGo: () => { const p = ref.current.toast?.page; set({ toast: null }); if (p) go(p) },
  }), [go, setPortal, setDemo, editKr, setKrDraft, saveKr, leadAction, openBooking, bookServiceCall, moveJob, advanceCandidate, decide, syncQbo, sendCampaign, setIdeaDraft, addIdea, vote, runRoutine, setRequestDraft, submitRequest, ask, advanceDeal, askAboutDeal, remindInvoice, toast, stopAutoplay, set])

  return { state, actions, prompts }
}

export type DemoActions = ReturnType<typeof useDemo>['actions']
