// @ts-nocheck
import { renderCard, CARDS, OG_SIZE } from '@/lib/ogRender'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = CARDS['arrival'].alt

export default function Image() {
  return renderCard('arrival')
}
