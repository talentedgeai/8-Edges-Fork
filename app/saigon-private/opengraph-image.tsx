// @ts-nocheck
import { renderCard, CARDS, OG_SIZE } from '@/lib/ogRender'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = CARDS['saigon-private'].alt

export default function Image() {
  return renderCard('saigon-private')
}
