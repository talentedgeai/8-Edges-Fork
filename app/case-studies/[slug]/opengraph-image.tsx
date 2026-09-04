// @ts-nocheck
import { renderCardDef, OG_SIZE } from '@/lib/ogRender'
import { getCaseStudyBySlug } from '@/lib/caseStudies'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'Case Study · Edge8'

export default function Image({ params }: { params: { slug: string } }) {
  const cs = getCaseStudyBySlug(params.slug)
  const title = cs?.title || 'Case Study'
  return renderCardDef({
    eyebrow: cs ? 'Case Study · AI Program' : 'Case Study',
    lines: [{ t: title, accent: true }],
    photo: cs?.image ? `public${cs.image}` : null,
    size: title.length > 14 ? 60 : 76,
    alt: `${title} Case Study · Edge8`,
  })
}
