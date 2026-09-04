'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { UnifiedPostMeta } from '@/lib/blog'

const INITIAL_COUNT = 12
const LOAD_MORE = 6

type Tab = { slug: string; label: string }

// Client shell for the blog index: category filtering + infinite scroll +
// reveal animation. Data (static + DB posts, pre-sorted newest-first) is passed
// in from the server page so the list revalidates on publish.
export default function BlogIndexClient({ posts, tabs }: { posts: UnifiedPostMeta[]; tabs: Tab[] }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const allTabs = [{ slug: 'all', label: 'All Posts' }, ...tabs]

  // Featured = the newest post (posts arrive newest-first).
  const featured = posts[0]

  const filteredPosts =
    activeCategory === 'all' ? posts : posts.filter((p) => p.categorySlug === activeCategory)

  const visiblePosts = filteredPosts.slice(0, visibleCount)
  const hasMore = visibleCount < filteredPosts.length

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
  }, [activeCategory])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => prev + LOAD_MORE)
        }
      },
      { rootMargin: '0px 0px 300px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeCategory, hasMore])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal:not(.visible)').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [visibleCount, activeCategory])

  return (
    <main>
      {/* ═══ HERO ═══════════════════════════════════════════════ */}
      <section className="site-blog-hero">
        <div className="container">
          <div className="site-blog-hero-inner">
            <h1 className="site-section-title site-on-dark">AI Insights &amp; Business Intelligence</h1>
            <p className="site-blog-hero-sub">Expert perspectives on AI strategy, leadership, and implementation from the Edge8 team.</p>

            {featured && (
              <Link href={`/post/${featured.slug}`} className="site-hero-featured-card">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  width={600}
                  height={338}
                  className="site-hero-featured-img"
                />
                <div className="site-hero-featured-body">
                  <span className="site-hero-featured-cat">{featured.category}</span>
                  <p className="site-hero-featured-date">
                    {new Date(featured.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <h2 className="site-hero-featured-title">{featured.title}</h2>
                  <p className="site-hero-featured-excerpt">{featured.excerpt}</p>
                  <span className="site-hero-featured-more">Read Article →</span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ═══ POSTS SECTION ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          {/* Category filter tabs */}
          <div className="site-blog-filter-tabs">
            {allTabs.map((cat) => (
              <button
                key={cat.slug}
                className={`site-blog-filter-tab${activeCategory === cat.slug ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat.slug)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Card grid */}
          {filteredPosts.length > 0 ? (
            <>
              <div className="site-blog-cards-grid">
                {visiblePosts.map((post) => (
                  <Link key={post.slug} href={`/post/${post.slug}`} className="site-blog-card reveal">
                    <div className="site-blog-card-img-wrap">
                      <Image
                        src={post.image}
                        alt={post.title}
                        fill
                        className="site-img-cover-only"
                      />
                    </div>
                    <div className="site-blog-card-body">
                      <span className="site-blog-card-cat">{post.category}</span>
                      <span className="site-blog-card-date">
                        {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                      <div className="site-blog-card-title">{post.title}</div>
                      <p className="site-blog-card-excerpt">{post.excerpt}</p>
                      <span className="site-blog-card-more">Read Article →</span>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Sentinel for infinite scroll */}
              {hasMore && <div ref={sentinelRef} className="site-hairline" aria-hidden="true" />}
            </>
          ) : (
            <div className="site-blog-empty">
              <p>No posts in this category yet. Check back soon.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
