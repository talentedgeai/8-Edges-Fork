import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, Block } from '@/entities/retreats'
import { verifyUnsubscribeToken } from '@/entities/site/lib/marketing-email'
import { UnsubscribeForm } from './UnsubscribeForm'

export const metadata: Metadata = {
  title: 'Edge8 · Unsubscribe',
  description: 'Stop receiving marketing email from Edge8.',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string | string[] }
}) {
  const raw = searchParams.token
  const token = Array.isArray(raw) ? raw[0] : raw
  const personId = token ? verifyUnsubscribeToken(token) : null

  return (
    <div className="xp-page">
      <article className="xp-article">
        <Link href="/" className="xp-backlink">
          ← Edge8
        </Link>

        <PageHeader
          eyebrow="Email preferences"
          title="Unsubscribe"
          lead="Manage the marketing email you receive from Edge8."
        />

        <div className="xp-blocks">
          <Block heading={personId ? 'Confirm' : 'This link did not work'}>
            {personId && token ? (
              <UnsubscribeForm token={token} />
            ) : (
              <p>
                This unsubscribe link is missing or is no longer valid. Email{' '}
                <a href="mailto:hello@edge8.ai">hello@edge8.ai</a> and we will remove you from the
                list by hand.
              </p>
            )}
          </Block>
        </div>
      </article>
    </div>
  )
}
