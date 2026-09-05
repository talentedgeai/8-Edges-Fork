export { default, size, contentType, alt } from '@/entities/site/routes/training-and-certification/opengraph-image'

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const runtime = 'nodejs'
