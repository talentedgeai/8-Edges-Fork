import type { Metadata } from 'next'

const title = 'Your First AI Hire | $5,400 vs $150K+ Full-Time | Edge8'
const description = 'Get your first AI Officer in 30 days for $5,400 over 3 months. 90-day guarantee. The fastest path to your first AI program.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/your-first-ai-hire/' },
  openGraph: { title, description, url: '/your-first-ai-hire/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
