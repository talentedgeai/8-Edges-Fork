import { describe, expect, it, vi } from 'vitest'

import { seedState } from './fixtures'
import { answerFreeText, promptsFor, type AssistantApi } from './prompts'
import { DEMOS, PAGE_LABEL, PAGE_PORTAL } from './data'
import type { Page } from './types'

// The demo's whole argument is that the assistant reads the same rows the
// screens show, so these tests pin that: change the state, and the scripted
// answer changes with it.

function api(): AssistantApi {
  return { toast: vi.fn(), decide: vi.fn(), ask: vi.fn() }
}

describe('promptsFor', () => {
  it('offers suggestions on the dashboard, each with an answer that cites tables', () => {
    const prompts = promptsFor(seedState(), 'dashboard', api())
    expect(prompts.length).toBeGreaterThanOrEqual(4)
    for (const p of prompts) expect(p.a()).toContain('Read:')
  })

  it('has at least one suggestion for every page in every portal', () => {
    const pages = Object.keys(PAGE_PORTAL) as Page[]
    for (const p of pages) expect(promptsFor(seedState(), p, api()).length, p).toBeGreaterThan(0)
  })

  it('counts the pending leave requests in the decision answer', () => {
    const s = seedState()
    const before = promptsFor(s, 'dashboard', api())[0].a()
    expect(before).toContain('2 leave requests')

    s.requests = s.requests.map((r) => (r.id === 1 ? { ...r, status: 'approved' } : r))
    const after = promptsFor(s, 'dashboard', api())[0].a()
    expect(after).toContain('1 leave request:')
    expect(after).not.toContain('Denny Okafor')
  })

  it('approves every pending request through the api when the decision action runs', () => {
    const a = api()
    const s = seedState()
    promptsFor(s, 'dashboard', a)[0].action?.run()
    expect(a.decide).toHaveBeenCalledTimes(2)
    expect(a.decide).toHaveBeenCalledWith(1, 'approved')
    expect(a.decide).toHaveBeenCalledWith(2, 'approved')
  })

  it('drops the reminder action once nothing is overdue', () => {
    const s = seedState()
    s.invoices = s.invoices.map((i) => ({ ...i, status: 'paid', over: undefined }))
    const overdue = promptsFor(s, 'invoices', api())[0]
    expect(overdue.a()).toContain('No overdue invoices')
    expect(overdue.action).toBeNull()
  })

  it('lists what the visitor changed on the results stop', () => {
    const s = seedState()
    const prompt = promptsFor(s, 'results', api())[2]
    expect(prompt.a()).toContain('Nothing yet from you')
    s.actions = [{ kind: 'leave', text: 'Approved Denny Okafor\'s vacation', at: 1 }]
    expect(promptsFor(s, 'results', api())[2].a()).toContain('Approved Denny Okafor')
  })
})

describe('answerFreeText', () => {
  it('matches a free-text question to the closest scripted one by shared words', () => {
    const r = answerFreeText(seedState(), api(), 'anything overdue on the invoices?')
    expect(r.text).toContain('overdue')
    expect(r.text).toContain('company_os.invoices')
  })

  it('admits it only knows the sample company when nothing matches', () => {
    const a = api()
    const r = answerFreeText(seedState(), a, 'xyzzy')
    expect(r.text).toContain('TrueFlow Plumbing Co.')
    r.action?.run()
    expect(a.ask).toHaveBeenCalledOnce()
  })
})

describe('the demo tabs', () => {
  it('give every screen a label and a portal', () => {
    for (const d of DEMOS) {
      expect(d.pages.length, d.label).toBeGreaterThan(0)
      for (const p of d.pages) {
        expect(PAGE_LABEL[p], p).toBeTruthy()
        expect(PAGE_PORTAL[p], p).toBeTruthy()
      }
    }
  })

  it('start with strategy, and the portals demo shows only the team and client doors', () => {
    expect(DEMOS[0].id).toBe('strategy')
    const portals = DEMOS.find((d) => d.id === 'portals')
    expect([...new Set(portals?.pages.map((p) => PAGE_PORTAL[p]))]).toEqual(['team', 'client'])
    expect(DEMOS).toHaveLength(6)
  })
})
