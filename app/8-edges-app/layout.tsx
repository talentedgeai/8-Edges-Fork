import type { Metadata } from 'next'
import './eight-edges-app.css'
import '@/app/styles/utilities.css'

const title = '8 Edges: The Open-Source Company Operating System | Edge8'
const description =
  'One centralized company database, three portals, and 13 scheduled agents. Fork it free, join the community for $99 a month, or have us install it for you.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/8-edges-app/' },
  openGraph: { title, description, url: '/8-edges-app/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
