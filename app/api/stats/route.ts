import { NextResponse } from 'next/server'
import { getWorkshopAttendeesTotal, getDocumentedWorkflowsTotal } from '@/lib/stats'

// Public home page stats. Cached at the CDN for 5 minutes. The two numbers are
// computed in lib/stats.ts, shared with the admin Marketing overview.
export const dynamic = 'force-dynamic'
// Without this, Next 14 serves the Supabase RPC response from the Data Cache
// indefinitely, so the counter never reflects DB updates until a redeploy.
export const fetchCache = 'force-no-store'

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
}

export async function GET() {
  const [workshopAttendees, documentedWorkflows] = await Promise.all([
    getWorkshopAttendeesTotal(),
    getDocumentedWorkflowsTotal(),
  ])
  // Fail soft per number: the client falls back to its baseline.
  return NextResponse.json({ workshopAttendees, documentedWorkflows }, { headers: CACHE_HEADERS })
}
