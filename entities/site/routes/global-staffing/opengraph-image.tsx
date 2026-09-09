// @ts-nocheck
import { renderCard, CARDS, OG_SIZE } from '@/entities/site/lib/ogRender'

export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = CARDS['global-staffing'].alt

export default function Image() {
  return renderCard('global-staffing')
}
