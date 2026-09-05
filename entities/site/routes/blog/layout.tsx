import type { Metadata } from 'next'

const title = 'Blog | AI Strategy, Agents & Leadership Insights | Edge8'
const description = 'Practical writing on AI Programs, fractional CAIO work, agent design, and how founders use AI to be Tech-Forward.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/blog/' },
  openGraph: { title, description, url: '/blog/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
