import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { allCaseStudies, getCaseStudyBySlug, getCaseStudiesByCategory, getAllCaseStudySlugs } from '@/lib/caseStudies'

export async function generateStaticParams() {
  return getAllCaseStudySlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cs = getCaseStudyBySlug(params.slug)
  if (!cs) return {}
  return {
    title: `${cs.title} Case Study | Edge8`,
    description: cs.description,
  }
}

const categoryLabels: Record<string, string> = {
  'ai-programs': 'AI Program',
}

const categoryRoutes: Record<string, string> = {
  'ai-programs': '/ai-programs',
}

const categoryBackLabels: Record<string, string> = {
  'ai-programs': 'AI Programs',
}

export default function CaseStudyPage({ params }: { params: { slug: string } }) {
  const cs = getCaseStudyBySlug(params.slug)
  if (!cs) notFound()

  const related = getCaseStudiesByCategory(cs.category)
    .filter((c) => c.slug !== cs.slug)
    .slice(0, 3)

  const eyebrow = categoryLabels[cs.category] ?? cs.category
  const categoryRoute = categoryRoutes[cs.category] ?? '/'
  const backLabel = categoryBackLabels[cs.category] ?? cs.category

  const imgs = cs.detailImages ?? []

  return (
    <main>
      {/* ═══ HERO ══════════════════════════════════════════════════════ */}
      <section className="cs-detail-hero">
        <div className="container">
          <div className="cs-detail-hero-inner">
            <div className="cs-eyebrow">{eyebrow}</div>
            <h1 className="cs-detail-title">{cs.title}</h1>
            <p className="cs-detail-sub">{cs.subtitle}</p>
          </div>
        </div>
      </section>

      {/* ═══ CONTENT ═══════════════════════════════════════════════════ */}
      <section className="cs-detail-content">
        <div className="container">
          <div className="cs-detail-layout">

            {/* LEFT: text blocks */}
            <div>
              <Link href={categoryRoute} className="cs-detail-back">
                ← Back to {backLabel}
              </Link>

              {/* Summary */}
              <div className="cs-detail-block">
                <div className="cs-detail-block-label">Summary</div>
                <p className="cs-detail-body">{cs.summary}</p>
              </div>

              {/* Challenge */}
              <div className="cs-detail-block">
                <div className="cs-detail-block-label">The Challenge</div>
                <ul className="cs-detail-list">
                  {cs.challenge.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>

              {/* Approach */}
              <div className="cs-detail-block">
                <div className="cs-detail-block-label">Our Approach</div>
                <ul className="cs-detail-list">
                  {cs.approach.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>

              {/* Result */}
              <div className="cs-detail-block">
                <div className="cs-detail-block-label">The Result</div>
                <ul className="cs-detail-list">
                  {cs.result.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>

              {/* Blog link */}
              {cs.blogLink && (
                <div className="cs-detail-block">
                  <p className="cs-detail-body">
                    Read the full story and explore our strategies in the complete blog post{' '}
                    <a href={cs.blogLink} style={{ color: 'var(--blue)' }} target="_blank" rel="noopener noreferrer">here</a>.
                  </p>
                </div>
              )}

              {/* CTA buttons */}
              {cs.website && (
                <div className="cs-detail-buttons">
                  <a
                    href={cs.website}
                    className="btn btn-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {cs.websiteLabel ?? 'View Website'} ↗
                  </a>
                </div>
              )}
            </div>

            {/* RIGHT: images */}
            <div className="cs-detail-media">
              {imgs.length === 0 && (
                <div className="cs-detail-img-wrap">
                  <Image src={cs.image} alt={cs.title} width={640} height={480} style={{ width: '100%', height: 'auto' }} />
                </div>
              )}

              {/* Single image */}
              {imgs.length === 1 && (
                <div className="cs-detail-img-wrap">
                  <Image src={imgs[0]} alt={cs.title} width={640} height={480} style={{ width: '100%', height: 'auto' }} priority />
                </div>
              )}

              {/* Before / After pair */}
              {imgs.length === 2 && cs.beforeAfter && (
                <>
                  <div className="cs-detail-img-wrap">
                    <Image src={imgs[0]} alt={`${cs.title} before`} width={640} height={420} style={{ width: '100%', height: 'auto' }} priority />
                    <div className="cs-slide-label">Before</div>
                  </div>
                  <div className="cs-detail-img-wrap">
                    <Image src={imgs[1]} alt={`${cs.title} after`} width={640} height={420} style={{ width: '100%', height: 'auto' }} />
                    <div className="cs-slide-label">After</div>
                  </div>
                </>
              )}

              {/* 2 images without before/after */}
              {imgs.length === 2 && !cs.beforeAfter && (
                <>
                  <div className="cs-detail-img-wrap">
                    <Image src={imgs[0]} alt={`${cs.title} 1`} width={640} height={420} style={{ width: '100%', height: 'auto' }} priority />
                  </div>
                  <div className="cs-detail-img-wrap">
                    <Image src={imgs[1]} alt={`${cs.title} 2`} width={640} height={420} style={{ width: '100%', height: 'auto' }} />
                  </div>
                </>
              )}

              {/* Multiple images (3+): show first 3 */}
              {imgs.length >= 3 && imgs.slice(0, 3).map((src, i) => (
                <div key={i} className="cs-detail-img-wrap">
                  <Image src={src} alt={`${cs.title} ${i + 1}`} width={640} height={420} style={{ width: '100%', height: 'auto' }} priority={i === 0} />
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ═══ RELATED ═══════════════════════════════════════════════════ */}
      {related.length > 0 && (
        <section className="cs-related">
          <div className="container">
            <div className="cs-related-label">More Case Studies</div>
            <h2 className="cs-related-title">{backLabel}</h2>
            <div className="cs-related-grid">
              {related.map((r) => (
                <Link key={r.slug} href={`/case-studies/${r.slug}`} className="cs-related-card">
                  <Image
                    src={r.image}
                    alt={r.title}
                    width={400}
                    height={225}
                    className="cs-related-card-img"
                  />
                  <div className="cs-related-card-body">
                    <div className="cs-related-card-name">{r.title}</div>
                    <div className="cs-related-card-sub">{r.subtitle}</div>
                    <div className="cs-related-card-link">View Case Study →</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
