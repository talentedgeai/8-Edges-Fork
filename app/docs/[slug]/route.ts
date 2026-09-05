export { GET } from '@/entities/library/routes/docs/[slug]/route'

// A redirect built from the request URL, so it is per-request. Re-declared here
// because Next reads a segment's config by static analysis of the file under
// app/ and would not see it through a re-export.
export const dynamic = 'force-dynamic'
