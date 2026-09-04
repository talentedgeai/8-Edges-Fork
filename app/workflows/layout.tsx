import type { Metadata } from 'next'
import './workflows.css'
import '@/app/styles/utilities.css'

const title = 'Workflows | Edge8'
const description =
  'The operating workflows we run Edge8 on. Real systems documented end to end: who does what, when it happens, and where AI does the heavy lifting.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/workflows/' },
  openGraph: { title, description, url: '/workflows/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
