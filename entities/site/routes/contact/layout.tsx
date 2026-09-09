import type { Metadata } from 'next'

const title = 'Book a Conversation | Free First AI Program Plan | Edge8'
const description = 'Book a 30-minute call with Edge8. We email your first AI Program plan within 88 minutes. Free, no slides, no pitch deck.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact/' },
  openGraph: { title, description, url: '/contact/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
