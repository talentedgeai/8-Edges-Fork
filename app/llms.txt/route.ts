export { GET } from '@/entities/site/routes/llms.txt/route'

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const dynamic = 'force-static'
