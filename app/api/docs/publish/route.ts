export { POST } from '@/entities/library/api/docs/publish/route'

// A token-authenticated upload endpoint, never cacheable. Re-declared here
// because Next reads a segment's config by static analysis of the file under
// app/ and would not see it through a re-export.
export const dynamic = 'force-dynamic'
