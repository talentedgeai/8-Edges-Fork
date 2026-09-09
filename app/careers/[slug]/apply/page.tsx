export { default, generateMetadata } from '@/entities/site/routes/careers/[slug]/apply/page'

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const dynamic = 'force-dynamic'
