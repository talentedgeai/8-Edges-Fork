// @ts-nocheck
import { renderCard, CARDS, OG_SIZE } from '@/entities/site/lib/ogRender'

export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = CARDS['blog'].alt

export default function Image() {
  return renderCard('blog')
}
