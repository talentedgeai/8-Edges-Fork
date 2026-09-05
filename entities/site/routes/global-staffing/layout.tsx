import type { Metadata } from 'next'

const title = 'Hire AI Engineers in Vietnam | 75% Less Than US Rates | Edge8'
const description = 'Access AI-trained engineers in Vietnam at 75% less than US rates. Deployed in 3 weeks. Every engineer trained in our AI Officer methodology.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/global-staffing/' },
  openGraph: { title, description, url: '/global-staffing/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
