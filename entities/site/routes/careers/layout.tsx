import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Careers at Edge8 | Join the AI Frontier',
  description:
    'Help founders lead AI. Edge8 is looking for strategists, builders, and thinkers who want to work at the frontier of AI adoption in business.',
  openGraph: {
    title: 'Careers at Edge8 | Join the AI Frontier',
    description:
      'Help founders lead AI. Work at the frontier of AI adoption in business.',
  },
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
