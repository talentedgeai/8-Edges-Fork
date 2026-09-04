import { NextRequest, NextResponse } from 'next/server'
import { isValidSlug } from '@/lib/docs'

export const dynamic = 'force-dynamic'

// Documents moved into the private workflows library, where the team already
// looks. This redirect exists because /docs/<slug> links were already shared;
// it keeps them working rather than breaking a link someone has in a chat.
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!isValidSlug(slug)) {
    return new NextResponse('Not found', { status: 404 })
  }
  return NextResponse.redirect(new URL(`/workflows/private/e8/${slug}/`, req.url), 308)
}
