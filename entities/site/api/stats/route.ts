import { NextResponse } from 'next/server'
import { getWorkshopAttendeesTotal, getDocumentedWorkflowsTotal } from '@/entities/library'

// Public home page stats. Cached at the CDN for 5 minutes. The two numbers are
// computed in the library entity's lib/stats.ts, shared with the admin Marketing overview.
// The cache segment config lives on the route file in app/, where Next reads it.

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
