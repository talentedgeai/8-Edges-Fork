import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPillars, getPostsByPillar } from '@/entities/site/lib/blog'
import PostCard from '../PostCard'

// A content pillar's hub: every published post that makes this argument,
// newest first, under the pillar's thesis. One canonical URL per pillar for
// search engines and for the sales pages to point at. Prerendered from the
// cached post list; dynamicParams (default true) renders a pillar that gains
// its first post after the build on demand.
export async function generateStaticParams() {
  return (await getPillars()).map((p) => ({ pillar: p.slug }))
}

export async function generateMetadata({ params }: { params: { pillar: string } }) {
  const pillar = (await getPillars()).find((p) => p.slug === params.pillar)
  if (!pillar) return {}
  const title = `${pillar.name} | Edge8 Blog`
  const description = pillar.thesis ?? `${pillar.count} posts on ${pillar.name} from the Edge8 team.`
  const canonical = `/blog/${pillar.slug}/`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PillarPage({ params }: { params: { pillar: string } }) {
  const pillar = (await getPillars()).find((p) => p.slug === params.pillar)
  if (!pillar) notFound()
  const posts = await getPostsByPillar(pillar.slug)

  return (
    <main>
      <section className="blog-hero">
        <div className="container">
          <div className="blog-hero-inner">
            <span className="site-eyebrow site-on-dark">Content pillar</span>
            <h1 className="section-title site-on-dark">{pillar.name}</h1>
            {pillar.thesis && <p className="blog-hero-sub">{pillar.thesis}</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="blog-cards-grid">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
          <div className="post-all-posts">
            <Link href="/blog" className="btn btn-secondary">← All Posts</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
