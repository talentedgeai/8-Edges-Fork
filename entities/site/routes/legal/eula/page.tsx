import type { Metadata } from 'next'
import { PageHeader, Block } from '@/entities/retreats'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Edge8 AI · Terms of Service',
  description: 'Terms of service and end-user license agreement for Talent Edge LLC (d/b/a Edge8).',
}

const EFFECTIVE_DATE = 'July 18, 2026'

export default function TermsOfServicePage() {
  return (
    <div className="xp-page">
      <article className="xp-article">
        <Link href="/" className="xp-backlink">
          ← Edge8
        </Link>

        <PageHeader
          eyebrow={`Effective ${EFFECTIVE_DATE}`}
          title="Terms of Service"
          lead="These terms (“Agreement”) govern your access to and use of the Edge8 website, client portal, and related services, operated by Talent Edge LLC, doing business as Edge8 (“Edge8,” “we,” “us”). By using our services, you agree to this Agreement."
        />

        <div className="xp-blocks">
          <Block heading="Acceptance of terms">
            <p>
              By accessing or using the Edge8 website, client portal, or any related service, you
              agree to be bound by this Agreement. If you don&apos;t agree, please don&apos;t use our
              services.
            </p>
          </Block>

          <Block heading="Description of services">
            <p>
              Edge8 provides AI leadership training, automation consulting, global staffing, and
              related programs, along with a client and team portal for managing engagements,
              invoicing, and communication.
            </p>
          </Block>

          <Block heading="Accounts">
            <p>
              Some parts of our services, such as the client and team portal, require an account.
              You&apos;re responsible for maintaining the confidentiality of your login credentials and
              for all activity under your account. Notify us promptly at{' '}
              <a href="mailto:hello@edge8.ai">hello@edge8.ai</a> if you suspect unauthorized use.
            </p>
          </Block>

          <Block heading="License to use our services">
            <p>
              Subject to your compliance with this Agreement, Edge8 grants you a limited,
              non-exclusive, non-transferable, revocable license to access and use our website and
              portal for their intended purposes. This license doesn&apos;t include any right to resell,
              copy, or create derivative works from our content or platform without our written
              permission.
            </p>
          </Block>

          <Block heading="Payment terms">
            <p>
              Fees for workshops, training, events, or consulting engagements are as quoted at the
              time of purchase or in your service agreement. Payments are processed through our
              third-party payment provider. Unless otherwise stated in a signed agreement, fees are
              non-refundable.
            </p>
          </Block>

          <Block heading="Intellectual property">
            <p>
              All content on our website and platform — including text, graphics, logos, curricula,
              and software — is owned by Edge8 or our licensors and is protected by intellectual
              property laws. You may not copy, modify, distribute, or create derivative works from
              our content without prior written consent.
            </p>
          </Block>

          <Block heading="Acceptable use">
            <p>You agree not to:</p>
            <ul>
              <li>Use our services for any unlawful purpose or in violation of this Agreement</li>
              <li>Attempt to gain unauthorized access to our systems, accounts, or data</li>
              <li>Interfere with or disrupt the integrity or performance of our services</li>
              <li>Scrape, harvest, or misuse content or data from our platform</li>
            </ul>
          </Block>

          <Block heading="Third-party services and links">
            <p>
              Our services may link to or integrate with third-party services (such as payment or
              scheduling providers). We aren&apos;t responsible for the content, policies, or practices
              of any third party.
            </p>
          </Block>

          <Block heading="Disclaimer of warranties">
            <p>
              Our services are provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind,
              express or implied, including merchantability, fitness for a particular purpose, or
              non-infringement.
            </p>
          </Block>

          <Block heading="Limitation of liability">
            <p>
              To the fullest extent permitted by law, Edge8 will not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising from your use of our
              services, even if we&apos;ve been advised of the possibility of such damages.
            </p>
          </Block>

          <Block heading="Indemnification">
            <p>
              You agree to indemnify and hold Edge8 harmless from any claims, damages, or expenses
              arising from your violation of this Agreement or misuse of our services.
            </p>
          </Block>

          <Block heading="Termination">
            <p>
              We may suspend or terminate your access to our services at any time for conduct that
              violates this Agreement or is otherwise harmful to Edge8 or other users.
            </p>
          </Block>

          <Block heading="Governing law">
            <p>
              This Agreement is governed by the laws of the State of Washington, without regard to
              its conflict-of-law principles.
            </p>
          </Block>

          <Block heading="Changes to these terms">
            <p>
              We may update this Agreement from time to time. We&apos;ll post the revised version here
              with an updated effective date. Continued use of our services after changes take
              effect constitutes acceptance of the revised terms.
            </p>
          </Block>

          <Block heading="Contact us">
            <p>
              Questions about these terms? Email us at{' '}
              <a href="mailto:hello@edge8.ai">hello@edge8.ai</a>.
            </p>
          </Block>
        </div>
      </article>
    </div>
  )
}
