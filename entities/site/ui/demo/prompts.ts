import { fmt, PLUMBERS, quarter, range, usd } from './data'
import type { Deal, DemoState, Page } from './types'

// The scripted data assistant. Every answer is a pure function of the current
// demo state, so approving a leave request or syncing QuickBooks changes what
// the assistant says next, which is the point being demonstrated: it reads the
// same rows the screens show. Each answer cites the tables it "read".

export type PromptAction = { label: string; run: () => void }
export type Prompt = { q: string; a: () => string; action?: PromptAction | null }

// What a prompt's action may do to the demo. Implemented by useDemo.
export type AssistantApi = {
  toast: (text: string) => void
  decide: (id: number, status: 'approved' | 'denied') => void
  ask: (q: string, answer?: string, action?: PromptAction | null) => void
}

export const cite = (...t: string[]) => '\n\nRead: ' + t.join(' · ')

export function dealAnswer(d: Deal): string {
  const last = d.activity[0]
  return `${d.company} · ${d.name}\n• ${d.amount ? usd(d.amount) : 'amount TBD'} · ${d.stage} · owner ${d.owner}\n• Expected close ${d.close}\n• Last activity: ${last.text} (${last.when})\n• Next step: ${d.next}` +
    cite('company_os.deals · 1 row', `company_os.interactions · ${d.activity.length} rows`)
}

export function promptsFor(s: DemoState, page: Page, api: AssistantApi): Prompt[] {
  const Q = quarter()
  const open = s.deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost')
  const pipe = open.reduce((n, d) => n + d.amount, 0)
  const pend = s.requests.filter((r) => r.status === 'requested')
  const over = s.invoices.filter((i) => i.status === 'overdue')
  const late = s.leads.filter((l) => l.slaMins < 0)
  const overSum = usd(over.reduce((n, i) => n + i.amount, 0))
  const first = pend[0]
  const todayJobs = s.jobs.filter((j) => j.col !== 'done')
  const cedar = s.invoices.filter((i) => i.client === 'Cedar Point Apartments')

  const decision: Prompt = {
    q: 'What needs my decision today?',
    a: () => {
      const L: string[] = []
      if (pend.length) L.push(`• ${pend.length} leave request${pend.length > 1 ? 's' : ''}: ${pend.map((r) => r.name).join(', ')}`)
      if (over.length) L.push(`• ${over.length} overdue invoice${over.length > 1 ? 's' : ''} · ${overSum}`)
      if (late.length) L.push(`• ${late.length} lead${late.length > 1 ? 's' : ''} past SLA: ${late.map((l) => `${l.name} (${l.company})`).join(', ')}`)
      L.push('• Cedar Point riser scope due before their Thursday board call')
      return `Here's what needs you today:\n${L.join('\n')}` +
        cite(`company_os.time_off · ${pend.length} rows`, `company_os.invoices · ${over.length} rows`, `company_os.lead · ${late.length} rows`, 'company_os.deals · 1 row')
    },
    action: first
      ? { label: `Approve ${pend.length === 1 ? first.name.split(' ')[0] + '\'s' : 'all pending'} leave`, run: () => pend.forEach((r) => api.decide(r.id, 'approved')) }
      : null,
  }
  const pipeline: Prompt = {
    q: 'What\'s in the pipeline?',
    a: () => `Open quotes total ${usd(pipe)} across ${open.length} deals.\n\nBiggest three:\n${[...open].sort((a, b) => b.amount - a.amount).slice(0, 3).map((d) => `• ${d.company} · ${usd(d.amount)} · ${d.stage}`).join('\n')}\n\nWon this quarter: ${usd(s.deals.filter((d) => d.stage === 'Won').reduce((n, d) => n + d.amount, 0))} across ${s.deals.filter((d) => d.stage === 'Won').length} commercial deals; the KR target is 6.` +
      cite(`company_os.deals · ${s.deals.length} rows`, 'company_os.key_results · 1 row'),
  }
  const overdueQ: Prompt = {
    q: 'Any overdue invoices?',
    a: () => over.length
      ? `${over.length} invoice${over.length > 1 ? 's' : ''} overdue, ${overSum} total:\n${over.map((i) => `• ${i.client} · ${usd(i.amount)} · ${i.over} days`).join('\n')}\n\nQuickBooks synced ${s.qboLast}.` +
        cite(`company_os.invoices · ${s.invoices.length} rows`, 'qbo_sync_log · 1 row')
      : `No overdue invoices. Largest outstanding: The Fremont Foundry Hotel $27,500, due ${fmt(13)}.` + cite(`company_os.invoices · ${s.invoices.length} rows`),
    action: over.length ? { label: 'Draft the reminders', run: () => api.toast(`${over.length} reminder drafts sent to Dana for a one-click send`) } : null,
  }
  const goalsQ: Prompt = {
    q: `How are ${Q.short} goals?`,
    a: () => `${Q.label}, week ${Q.week} of 13: ${s.krs.filter((o) => o.health === 'on track').length} objective${s.krs.filter((o) => o.health === 'on track').length === 1 ? '' : 's'} on track, ${s.krs.filter((o) => o.health === 'at risk').length} at risk (${s.krs.filter((o) => o.health === 'at risk').map((o) => o.office).join(', ')}), ${s.krs.filter((o) => o.health === 'off track').length} off track (Innovation — agent delivery mix at ${s.krs[3].krs[0].cur}% vs 50%).` +
      cite('company_os.objectives · 4 rows', 'company_os.key_results · 8 rows'),
  }
  const crewToday: Prompt = {
    q: 'Who\'s on a job right now?',
    a: () => `${todayJobs.filter((j) => j.col === 'in_progress').length} vans on site:\n${todayJobs.filter((j) => j.col === 'in_progress').map((j) => `• ${j.plumber} · ${j.customer} · ${j.title}`).join('\n')}\n\n${todayJobs.filter((j) => j.col === 'scheduled').length} more scheduled. Dana is dispatching from the shop.` +
      cite(`company_os.tasks · ${todayJobs.length} rows`, 'company_os.team_members · 7 rows'),
  }
  const strategyQ: Prompt = {
    q: 'Remind me of the strategy',
    a: () => 'Grow commercial, keep the 60-minute promise. Two bets for 2026: push commercial past a third of the book (22% today), and never let emergency response slip while the crew grows (62 min average against a 55 target).' +
      cite('company_os.strategies · 1 row', 'company_os.key_results · 2 rows'),
  }

  const byPage: Record<Page, Prompt[]> = {
    strategy: [strategyQ, goalsQ,
      { q: 'Which value is at risk?', a: () => '“Answer the phone.” 81% of emergencies were answered inside 60 minutes this quarter against a 90% target; the misses cluster after 6 pm when Dana is off.' + cite('company_os.core_values · 4 rows', 'company_os.lead · 40 rows') },
      { q: 'Who owns what?', a: () => 'Ray owns commercial growth and the agent-mix objective. Dana owns the 60-minute promise. Chuck owns the apprentice pipeline. Two key results run fully by agents: emergencies answered inside SLA and applications screened within 24 h.' + cite('company_os.key_results · 8 rows') }],
    goals: [goalsQ,
      { q: 'Which key results are agents running?', a: () => 'Two of eight run fully by agents: emergencies answered inside 60 min (speed-to-lead agent) and applications screened within 24 h (application screener). Three more are blended.' + cite('company_os.key_results · 8 rows') },
      { q: 'Why is Revenue at risk?', a: () => `Commercial share is ${s.krs[0].krs[0].cur}% against 35%, and ${s.krs[0].krs[1].cur} of 6 commercial deals are won. Cedar Point ($86,000) and Rainier Ridge ($142,000) would close the gap in one quarter.` + cite('company_os.key_results · 2 rows', 'company_os.deals · 2 rows'),
        action: { label: 'Draft the Cedar Point follow-up', run: () => api.toast('Follow-up drafted for the Cedar Point property manager · saved to the deal') } },
      { q: 'What did the last check-in say?', a: () => 'Dana checked in “Emergencies answered within 60 min” on Monday: 81%, up from 76%. Her note: the new on-call rota covers Saturdays; Sunday evenings are still the gap.' + cite('company_os.key_result_checkins · 1 row') }],
    dashboard: [decision, pipeline, crewToday,
      { q: 'How did last week go?', a: () => 'Last week: 31 service calls, 27 closed same day. Revenue booked $48,900. Two callbacks (both Pike & Pine drain). Average first response 52 minutes, the target is 60.' + cite('company_os.tasks · 31 rows', 'company_os.invoices · 19 rows', 'company_os.lead · 12 rows') },
      { q: 'Which office is behind?', a: () => `Revenue: commercial share ${s.krs[0].krs[0].cur}% vs 35%, and ${late.length} lead${late.length === 1 ? '' : 's'} past the SLA window. Talent is one apprentice into a target of three.` + cite('company_os.key_results · 8 rows', `company_os.lead · ${s.leads.length} rows`) }],
    results: [decision, goalsQ,
      { q: 'What changed since I opened this?', a: () => s.actions.length ? `${s.actions.length} change${s.actions.length > 1 ? 's' : ''}, every one in audit_log:\n${s.actions.slice(-6).map((a) => `• ${a.text}`).join('\n')}` + cite(`audit_log · ${s.actions.length} rows`) : 'Nothing yet from you. The agents ran 4 routines while you looked around.' + cite('audit_log · 4 rows') },
      { q: 'What would you do next?', a: () => 'Two moves: send the Cedar Point riser scope before Thursday (commercial share), and hand the after-hours auto-reply to an agent (60-minute promise, and one more KR into the agent mix).' + cite('company_os.key_results · 3 rows', 'company_os.deals · 1 row') }],
    deals: [pipeline,
      { q: 'Summarise the Cedar Point riser job', a: () => dealAnswer(s.deals.find((x) => x.company === 'Cedar Point Apartments') ?? s.deals[0]),
        action: { label: 'Draft the follow-up', run: () => api.toast('Follow-up drafted for the Cedar Point property manager · saved to the deal') } },
      { q: 'What closes this month?', a: () => { const soon = open.filter((d) => d.close !== 'TBD').slice(0, 2); return `Due to close in the next 30 days:\n${soon.map((d) => `• ${d.company} · ${usd(d.amount)} · ${d.close}`).join('\n')}` + cite(`company_os.deals · ${open.length} rows`) } },
      { q: 'Why did we lose Pike & Pine?', a: () => 'Emergency sewer repair, $9,800, lost to a competitor on price 8 days ago. The lateral repair is still recommended; the account stays active for the quarterly jetting.' + cite('company_os.deals · 1 row', 'company_os.companies · 1 row') }],
    leads: [
      { q: 'Which leads are past SLA?', a: () => late.length
          ? `${late.length} past SLA:\n${late.map((l) => `• ${l.name} · ${l.subject.split(' · ')[0]} · ${Math.floor(Math.abs(l.slaMins) / 60)}h ${Math.abs(l.slaMins) % 60}m over · ${l.attempts} attempt${l.attempts === 1 ? '' : 's'}`).join('\n')}` + cite(`company_os.lead · ${s.leads.length} rows`)
          : 'Every lead is inside its SLA window right now.' + cite(`company_os.lead · ${s.leads.length} rows`),
        action: late.length ? { label: 'Text the customer an ETA', run: () => api.toast(`ETA text sent to ${late[0].name} · logged on the lead`) } : null },
      { q: 'Where do our leads come from?', a: () => 'Last 90 days, 131 service requests: 44% repeat customers, 23% Google Business, 18% referrals (Cedar Point and Lakeside send the most), 15% website scheduler.' + cite('company_os.lead · 131 rows', 'company_os.inquiries · 131 rows') },
      { q: 'How fast do we respond?', a: () => 'Median first response this month: 38 minutes. 81% inside the one-hour promise. The misses cluster after 6 pm.' + cite('company_os.lead · 40 rows') }],
    dispatch: [crewToday,
      { q: 'What does one booking write?', a: () => 'Six rows in one transaction: the customer (people), the slot (bookings, plumber auto-assigned by skill and load), the request (inquiries), the SLA clock (lead), the account (companies) and the job card (tasks). The client hub and the plumber\'s week read those same rows.' + cite('company_os.bookings · 1 row', 'company_os.tasks · 1 row') },
      { q: 'Who has capacity tomorrow?', a: () => { const load = PLUMBERS.map((p) => `• ${p} · ${s.jobs.filter((j) => j.plumber === p && j.col !== 'done').length} open`).join('\n'); return `Open cards per van:\n${load}\n\nLena is off ${range(3, 5)}.` + cite(`company_os.tasks · ${todayJobs.length} rows`, 'company_os.time_off · 1 row') } }],
    team: [crewToday,
      { q: 'Who is on probation?', a: () => 'Sal Moreno, apprentice, started in January. Probation review due in 9 days; Chuck is the reviewer. Ride-along notes from Marisol are all positive.' + cite('company_os.team_members · 1 row', 'company_os.probation_reviews · 1 row') },
      { q: 'Who is out next week?', a: () => `${s.requests.filter((r) => r.status === 'approved').map((r) => `• ${r.name} · ${r.type} · ${r.range}`).join('\n')}\n\nDispatch has 4 vans those days, not 5.` + cite('company_os.time_off · 5 rows') },
      { q: 'What\'s the crew\'s first-time fix rate?', a: () => '92% this quarter. Chuck 97%, Marisol 95%, Lena 93%, Denny 88% (two water-heater callbacks), Sal rides along and is not scored yet.' + cite('company_os.tasks · 131 rows', 'company_os.team_members · 7 rows') }],
    candidates: [
      { q: 'Who should I interview first?', a: () => 'Nadia Oyelaran (93): journeyman card, 9 years, hospital and hotel service, the Fremont Foundry profile. Wade Fenner (88) is second, commercial repipes like Cedar Point.' + cite('company_os.applications · 7 rows', 'company_os.ai_screenings · 7 rows'),
        action: { label: 'Book Nadia for a ride-along', run: () => api.toast('Ride-along with Chuck booked for Nadia Oyelaran') } },
      { q: 'How many applied this month?', a: () => '23 applications in 30 days, up 31% since the Indeed post went live. The screener read every résumé within 24 hours; 3 are waiting on a human.' + cite('company_os.applications · 23 rows') },
      { q: 'What does the screener check?', a: () => 'Journeyman or apprentice card, years in service plumbing, commercial vs residential mix, driving record, and whether the résumé matches the req. It writes a summary and a score; a human makes every advance decision.' + cite('company_os.ai_screenings · 23 rows') }],
    timeoff: [
      { q: 'Who\'s waiting on leave approval?', a: () => pend.length
          ? `${pend.length} request${pend.length > 1 ? 's' : ''}:\n${pend.map((r) => `• ${r.name} · ${r.type} · ${r.range} · “${r.reason}”`).join('\n')}` + cite(`company_os.time_off · ${s.requests.length} rows`)
          : 'Nothing pending.' + cite(`company_os.time_off · ${s.requests.length} rows`),
        action: first ? { label: `Approve ${first.name.split(' ')[0]}'s`, run: () => api.decide(first.id, 'approved') } : null },
      { q: 'Does Denny\'s trip leave us short?', a: () => `Denny is out ${range(7, 11)}. Lena is back by then; you'd have 4 vans plus Sal. Two jobs are booked on his route those days, both movable.` + cite('company_os.time_off · 2 rows', 'company_os.tasks · 2 rows') },
      { q: 'How much leave has the crew used?', a: () => '41 days taken this year, 5.9 per person. Marisol has the most left (14 days), Chuck the least (4).' + cite('company_os.time_off · 41 rows', 'company_os.team_members · 7 rows') }],
    invoices: [overdueQ,
      { q: 'When does Fremont Foundry pay?', a: () => `INV-2051, $27,500, due ${fmt(13)}. Their last three invoices paid on average 4 days early, but their satisfaction trend is down; worth a call.` + cite('company_os.invoices · 4 rows', 'company_os.survey_responses · 3 rows') },
      { q: 'What\'s our cash position?', a: () => `Collected in the last 30 days: $212,400. Outstanding: ${usd(s.invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + i.amount, 0))}. QuickBooks balance synced ${s.qboLast}.` + cite(`company_os.invoices · ${s.invoices.length} rows`, 'qbo_accounts · 1 row') }],
    marketing: [
      { q: 'Who gets Beat the Freeze?', a: () => '50 residential customers with a completed job in the last 12 months and marketing consent. Commercial accounts are excluded; they get the account manager, not the campaign.' + cite('company_os.people · 50 rows', 'company_os.email_campaigns · 1 row') },
      { q: 'How are customers rating us?', a: () => 'Post-Service Satisfaction, last 30 days: 4.7 average across 41 responses, 93% would recommend. One account trending down: The Fremont Foundry Hotel (3.4 → 2.9).' + cite('company_os.survey_responses · 41 rows'),
        action: { label: 'Flag Fremont Foundry as at-risk', run: () => api.toast('Fremont Foundry Hotel flagged at-risk · Ray notified') } },
      { q: 'What did the last campaign do?', a: () => 'Fall water-heater tune-up: 212 sends, 38% opened, 14 bookings, $6,800 in jobs. Cost: one agent run.' + cite('company_os.email_campaigns · 1 row', 'company_os.bookings · 14 rows') }],
    innovation: [
      { q: 'What are the top crew ideas?', a: () => s.ideas.slice(0, 3).map((i) => `• ${i.title} (${i.votes} votes)`).join('\n') + cite(`company_os.ideas · ${s.ideas.length} rows`, 'company_os.idea_votes · 40 rows'),
        action: { label: 'Turn the arrival tracker into a job card', run: () => api.toast('Card created on the Operations board · assigned to Dana') } },
      { q: 'How much of the plan do agents run?', a: () => `${s.krs[3].krs[0].cur}% of key results are agent-run or blended. Target is 50% — one more KR handed to an agent gets you there.` + cite('company_os.key_results · 8 rows') },
      { q: 'What did the crawlspace lesson teach us?', a: () => 'Chuck logged that installs run 45 minutes over when the old unit sits in a crawlspace. Since then Dana adds a crawlspace question to the booking call and blocks the extra time.' + cite('company_os.ideas · 1 row', 'company_os.tasks · 12 rows') }],
    agents: [decision,
      { q: 'Which agents ran today?', a: () => `${s.routines.filter((r) => r.status === 'ok').length} routines ran OK, ${s.routines.filter((r) => r.status === 'skipped').length} skipped (nothing due), 0 failing. Most recent: ${s.routines[0].name} (${s.routines[0].reported}).` + cite('audit_log.routine_runs · 13 rows') },
      { q: 'What did the dispatch digest say?', a: () => 'Tomorrow: 11 jobs, 5 vans, one 2 pm gap on Denny\'s route. Suggests pulling the Queen Anne backflow test forward to fill it.' + cite('audit_log.routine_runs · 1 row', 'company_os.tasks · 11 rows'),
        action: { label: 'Fill the gap with Queen Anne', run: () => api.toast('Queen Anne backflow test scheduled 2 pm on Denny\'s route') } },
      { q: 'How much do the agents cost?', a: () => '1.1M tokens in 30 days, about $9. The speed-to-lead agent alone saved 38 leads from going past SLA this month.' + cite('audit_log.ai_usage · 30 rows') },
      { q: 'Can you approve leave for me?', a: () => 'Only with your OK on each one. I draft the decision and the notification; you tap approve. Every write lands in audit_log with your name on it.' + cite('audit_log · policy') }],
    'my-week': [
      { q: 'What\'s on my route today?', a: () => `${s.jobs.filter((j) => j.plumber === 'Chuck Bearden' && j.col !== 'done').map((j) => `• ${j.when} · ${j.customer} · ${j.title}`).join('\n')}` + cite('company_os.tasks · 2 rows') },
      { q: 'How is my apprentice doing?', a: () => 'Sal Moreno: 30 ride-alongs, first-time fix on 9 of 11 solo calls, probation review due in 9 days. Marisol\'s notes are all positive.' + cite('company_os.coaching_notes · 6 rows', 'company_os.probation_reviews · 1 row') }],
    'my-goals': [
      { q: 'Which key results am I on?', a: () => 'You own “Apprentices on the roster” (1 of 3). You contribute to “Avg emergency response” through the on-call rota.' + cite('company_os.key_results · 2 rows') }],
    'team-ideas': [
      { q: 'Did my crawlspace lesson change anything?', a: () => 'Yes: Dana added a crawlspace question to the booking call and blocks an extra 45 minutes. Water heater overruns are down from 6 to 1 this month.' + cite('company_os.ideas · 1 row', 'company_os.tasks · 12 rows') }],
    hub: [
      { q: 'Where is the riser project?', a: () => 'Phase 1 (assessment and camera survey) is complete. Phase 2, risers on stacks A/B, starts once the revised scope is signed; Ray sends it before Thursday.' + cite('company_os.client_roadmap_groups · 4 rows', 'company_os.deals · 1 row') },
      { q: 'Who is coming for unit 14B?', a: () => `Denny Okafor is on site now for the unit 14B leak (${s.jobs.find((j) => j.id === 'J-1042')?.col === 'done' ? 'completed' : 'in progress'}).` + cite('company_os.tasks · 1 row') }],
    'client-invoices': [
      { q: 'What do we owe?', a: () => `${usd(cedar.filter((i) => i.status !== 'paid').reduce((n, i) => n + i.amount, 0))} open across ${cedar.filter((i) => i.status !== 'paid').length} invoices.` + cite(`company_os.invoices · ${cedar.length} rows`) }],
    requests: [
      { q: 'How fast does TrueFlow respond?', a: () => 'Your requests land in TrueFlow\'s lead queue with a 60-minute clock. Your last three were answered in 22, 41 and 18 minutes.' + cite('company_os.lead · 3 rows') }],
  }
  return byPage[page] ?? byPage.dashboard
}

const PAGES: Page[] = ['strategy', 'goals', 'dashboard', 'results', 'deals', 'leads', 'dispatch', 'team', 'candidates', 'timeoff', 'invoices', 'marketing', 'innovation', 'agents']

// Free-text questions match the closest scripted one by shared words; anything
// else gets an honest "this demo only knows the sample company" reply.
export function answerFreeText(s: DemoState, api: AssistantApi, q: string): { text: string; action: PromptAction | null } {
  const all = PAGES.flatMap((p) => promptsFor(s, p, api))
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  let best: Prompt | null = null, score = 0
  for (const p of all) {
    const sc = words.filter((w) => p.q.toLowerCase().includes(w)).length
    if (sc > score) { score = sc; best = p }
  }
  if (best && score > 0) return { text: best.a(), action: best.action ?? null }
  const near = promptsFor(s, s.page, api)[0]
  return {
    text: `This demo only knows the sample company, TrueFlow Plumbing Co., and a fixed set of questions. The nearest one I can answer here is “${near.q}”.`,
    action: { label: near.q, run: () => api.ask(near.q, near.a(), near.action) },
  }
}
