import { NextRequest, NextResponse } from 'next/server'
import { DOCS_BUCKET, ensureBucket, isValidSlug } from '@/lib/docs'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024

// Upload endpoint for scripts/docs/publish.mjs. Authenticated with
// DOCS_PUBLISH_TOKEN so publishing never needs the Supabase secret key on a
// laptop: the key stays in Vercel, where it already lives.
export async function POST(req: NextRequest) {
  const token = process.env.DOCS_PUBLISH_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'DOCS_PUBLISH_TOKEN is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { slug?: string; title?: string; html?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const { slug, title, html } = body
  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug: lowercase letters, numbers and dashes' }, { status: 400 })
  }
  if (!html || typeof html !== 'string') {
    return NextResponse.json({ error: 'Missing html' }, { status: 400 })
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) {
    return NextResponse.json({ error: 'Document is larger than 8MB' }, { status: 413 })
  }

  await ensureBucket()

  const publishedAt = new Date().toISOString()

  // cacheControl must be '0'. Storage defaults to 3600, which caches the object
  // for an hour: a republish is stored but the old copy keeps being served, so
  // updating a document silently does nothing. The whole point of this route is
  // that overwriting a slug updates what the team sees immediately.
  const upload = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(`${slug}.html`, html, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
      cacheControl: '0',
    })
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 })
  }

  // Sidecar so the index can show a real title and date without downloading
  // every document.
  await supabase.storage
    .from(DOCS_BUCKET)
    .upload(`${slug}.meta.json`, JSON.stringify({ title: title || slug, publishedAt }, null, 2), {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '0',
    })

  return NextResponse.json({
    ok: true,
    slug,
    url: `https://www.edge8.ai/workflows/private/e8/${slug}`,
    publishedAt,
  })
}
