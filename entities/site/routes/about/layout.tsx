import type { Metadata } from 'next'

const title = 'About Edge8 | Dave Hajdu, Founder & AI Officer'
const description = 'Dave Hajdu founded Edge8 after 25 years in enterprise tech, leading AI programs in 30+ companies. We help founders be Tech-Forward.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about/' },
  openGraph: { title, description, url: '/about/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
