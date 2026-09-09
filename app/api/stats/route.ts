export { GET } from '@/entities/site/api/stats/route'

// Public home page stats, cached at the CDN for 5 minutes.
export const dynamic = 'force-dynamic'
// Without this, Next 14 serves the Supabase RPC response from the Data Cache
// indefinitely, so the counter never reflects DB updates until a redeploy.
export const fetchCache = 'force-no-store'
