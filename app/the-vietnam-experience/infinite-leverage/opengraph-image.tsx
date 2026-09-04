// @ts-nocheck
import { renderCard, CARDS, OG_SIZE } from '@/lib/ogRender'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = CARDS['tve-infinite-leverage'].alt

export default function Image() {
  return renderCard('tve-infinite-leverage')
}
