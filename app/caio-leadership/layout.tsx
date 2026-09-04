import type { Metadata } from 'next'

const title = 'Fractional CAIO | C-Level AI Leadership Without the $300K Mistake | Edge8'
const description = 'Get strategic AI leadership without hiring a $300K full-time CAIO. Fractional, advisory, or embedded models from Edge8.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/caio-leadership/' },
  openGraph: { title, description, url: '/caio-leadership/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
