import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Deletes all passport images once we are past TRIP_END_DATE + 30 days, fulfilling
// the "deleted within 30 days of the trip" promise on the form. Triggered by the
// Vercel cron defined in vercel.json. Until the cutoff passes it is a no-op.
export async function GET(req: NextRequest) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tripEnd = process.env.TRIP_END_DATE // e.g. "2026-08-15"
  if (!tripEnd) {
    return NextResponse.json({ ok: true, skipped: 'TRIP_END_DATE not set' })
  }

  const cutoff = new Date(tripEnd)
  cutoff.setDate(cutoff.getDate() + 30)
  if (Number.isNaN(cutoff.getTime())) {
    return NextResponse.json({ error: 'Invalid TRIP_END_DATE' }, { status: 500 })
  }
  if (new Date() < cutoff) {
    return NextResponse.json({ ok: true, skipped: 'before cutoff', purgeOn: cutoff.toISOString() })
  }

  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'))

  // Collect every stored passport path, delete the objects, then delete the rows.
  const { data: rows, error: selErr } = await supabase
    .from('trip_passports')
    .select('id, path')
  if (selErr) {
    console.error('Cleanup select error:', selErr)
    return NextResponse.json({ error: 'Failed to read passports' }, { status: 500 })
  }

  const paths = (rows ?? []).map((r) => r.path as string)
  if (paths.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 })
  }

  const { error: rmErr } = await supabase.storage.from('passports').remove(paths)
  if (rmErr) {
    console.error('Cleanup storage remove error:', rmErr)
    return NextResponse.json({ error: 'Failed to delete passport files' }, { status: 500 })
  }

  const { error: delErr } = await supabase
    .from('trip_passports')
    .delete()
    .in('id', (rows ?? []).map((r) => r.id))
  if (delErr) {
    console.error('Cleanup row delete error:', delErr)
    return NextResponse.json({ error: 'Files deleted but failed to clear rows' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: paths.length })
}
