import { beforeEach, describe, expect, it, vi } from 'vitest'

// The form used to insert trip_members one row at a time, so a family of ten
// paid ten round trips before the first passport upload started. This pins the
// batched shape: one insert carrying every member, with the ids minted locally
// so the passport paths still key on the member.

const inserts: { table: string; payload: unknown }[] = []

function from(table: string) {
  return {
    insert: (payload: unknown) => {
      inserts.push({ table, payload })
      const result = { data: { id: 'family-1' }, error: null }
      return {
        select: () => ({ single: async () => result }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from,
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: null }) }) },
  }),
}))
vi.mock('@/kernel/config/env', () => ({ requireEnv: () => 'stub' }))
vi.mock('@/kernel/messaging/lark', () => ({ notifyOps: vi.fn(async () => undefined) }))

beforeEach(() => {
  inserts.length = 0
  delete process.env.RESEND_API_KEY
})

describe('vietnam adventure info form', () => {
  it('inserts every family member in one statement', async () => {
    const form = new FormData()
    form.set('family_name', 'Doan')
    form.set('contact_name', 'Khoa')
    form.set('contact_email', 'khoa@example.com')
    form.set('member_count', '3')
    for (let i = 0; i < 3; i++) {
      form.set(`member_name_${i}`, `Member ${i}`)
      form.set(`member_size_${i}`, 'M')
    }

    const { POST } = await import('./route')
    const res = await POST(new Request('https://edge8.ai/api/x', { method: 'POST', body: form }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true })
    const memberInserts = inserts.filter((i) => i.table === 'trip_members')
    expect(memberInserts).toHaveLength(1)
    expect(memberInserts[0].payload).toHaveLength(3)
  })
})
