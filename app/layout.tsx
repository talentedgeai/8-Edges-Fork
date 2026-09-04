import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
import SiteFrame from '@/components/SiteFrame'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.edge8.ai'),
  title: 'Edge8 | AI Leadership, Automation & Global Talent Solutions',
  description: 'Edge8 helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
  openGraph: {
    title: 'Edge8 | AI Leadership, Automation & Global Talent Solutions',
    description: 'Edge8 helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
    url: 'https://www.edge8.ai',
    siteName: 'Edge8',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Edge8 | AI Leadership, Automation & Global Talent Solutions',
    description: 'Edge8 helps organizations become Tech-Forward through AI Leadership, AI Programs, and Global Talent Staffing. Achieve 8x efficiency.',
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Edge8',
  alternateName: 'Edge8 AI',
  url: 'https://www.edge8.ai',
  logo: 'https://www.edge8.ai/logo.png',
  description:
    'Edge8 helps founders be Tech-Forward through AI Programs, fractional CAIO leadership, AI Officer Certification, and global AI talent staffing.',
  founder: { '@type': 'Person', name: 'Dave Hajdu' },
  sameAs: ['https://www.linkedin.com/company/edge8ai/'],
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: 'hello@edge8.ai',
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
