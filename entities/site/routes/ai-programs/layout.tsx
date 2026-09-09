import type { Metadata } from 'next'

const title = 'AI Programs | Ship 3 AI Agents a Quarter | Edge8'
const description = 'We design, build, and deploy AI agents that take the highest-volume work off your team. First agent in production inside 30 days.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/ai-programs/' },
  openGraph: { title, description, url: '/ai-programs/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
