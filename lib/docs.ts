import { supabase } from '@/lib/supabase'

// Documents live in Supabase Storage, not in the repo, so publishing one is an
// upload rather than a deploy. Nothing here is generated at build time.
export const DOCS_BUCKET = 'documents'

export type DocMeta = {
  slug: string
  title: string
  publishedAt: string
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)
}

// Reads an object bypassing Storage's CDN.
//
// storage.download() is served through Supabase's cache, so a republished
// document kept returning the previous copy: the upload succeeded, the bytes
// on the site did not change. Uploading with cacheControl '0' was not enough
// on its own for objects already stored. A unique query string per request is,
// because there is no shared cache entry to hit. Vercel is not involved: that
// hop is already no-store and measured as a MISS.
export async function downloadFresh(path: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null

  const res = await fetch(`${url}/storage/v1/object/authenticated/${DOCS_BUCKET}/${path}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.text()
}

// Created on first publish so there is no manual dashboard step. Private: the
// route below is the only way in, and it checks the access cookie first.
export async function ensureBucket(): Promise<void> {
  const { data } = await supabase.storage.getBucket(DOCS_BUCKET)
  if (data) return
  await supabase.storage.createBucket(DOCS_BUCKET, { public: false })
}

// Same reason as downloadFresh: storage.list() goes through a cached fetch, so a
// newly published document did not appear in the index until something else
// evicted it. Call the list endpoint directly with no-store.
async function listObjects(): Promise<{ name: string }[]> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return []

  const res = await fetch(`${url}/storage/v1/object/list/${DOCS_BUCKET}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prefix: '',
      limit: 200,
      offset: 0,
      sortBy: { column: 'updated_at', order: 'desc' },
    }),
    cache: 'no-store',
  })
  if (!res.ok) return []
  return (await res.json()) as { name: string }[]
}

export async function listDocs(): Promise<DocMeta[]> {
  const data = await listObjects()
  if (!data.length) return []

  const slugs = data.filter((o) => o.name.endsWith('.html')).map((o) => o.name.replace(/\.html$/, ''))

  const metas = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await downloadFresh(`${slug}.meta.json`)
      if (!raw) return { slug, title: slug, publishedAt: '' }
      try {
        const meta = JSON.parse(raw) as Partial<DocMeta>
        return { slug, title: meta.title || slug, publishedAt: meta.publishedAt || '' }
      } catch {
        return { slug, title: slug, publishedAt: '' }
      }
    }),
  )

  return metas.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
}
