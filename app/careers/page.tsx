export { default } from '@/entities/site/routes/careers/page'

// Postings come live from the ATS — render per-request so publishing a role in
// the admin shows up without a redeploy. Next reads segment config by static
// analysis of the file in app/, so it stays on the mount.
export const dynamic = 'force-dynamic'
