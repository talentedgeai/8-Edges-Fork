import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
import { SiteFrame } from '@/entities/site'

export const metadata: Metadata = {
  metadataBase: new URL('https://arca-wellness.vercel.app'),
  title: 'Arca Wellness | AI Leadership, Automation & Global Talent Solutions',
  description: 'Arca Wellness helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
  openGraph: {
    title: 'Arca Wellness | AI Leadership, Automation & Global Talent Solutions',
    description: 'Arca Wellness helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
    url: 'https://arca-wellness.vercel.app',
    siteName: 'Arca Wellness',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arca Wellness | AI Leadership, Automation & Global Talent Solutions',
    description: 'Arca Wellness helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Arca Wellness',
  url: 'https://arca-wellness.vercel.app',
  logo: 'https://arca-wellness.vercel.app/logo.png',
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: 'derek.nguyen@edge8.ai',
      areaServed: ['US', 'VN', 'SG', 'MY'],
      availableLanguage: ['English'],
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SiteFrame>{children}</SiteFrame>
        <Analytics />
      </body>
    </html>
  )
}
