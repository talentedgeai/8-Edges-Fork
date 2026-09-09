import type { Metadata } from 'next'

const title = 'AI Officer Certification | 12 Months, 500+ Certified | Edge8'
const description = 'The AI Officer Certification turns managers into AI leaders. 500+ certified across Fortune 500s. 12 months, 3 hours per week, 100% online.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/training-and-certification/' },
  openGraph: { title, description, url: '/training-and-certification/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
