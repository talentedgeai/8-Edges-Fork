export { POST } from '@/entities/site/api/careers/apply/route'

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const runtime = 'nodejs'
