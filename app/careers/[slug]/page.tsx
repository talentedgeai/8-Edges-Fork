export { default, generateMetadata } from '@/entities/site/routes/careers/[slug]/page'

// The posting is read from the ATS per request, like the index above it. Next
// reads segment config by static analysis of the file in app/, so it stays here.
export const dynamic = 'force-dynamic'
