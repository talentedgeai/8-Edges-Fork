import type { MetadataRoute } from 'next'
import { allCaseStudies } from '@/entities/site/lib/caseStudies'
import { allWorkflows } from '@/entities/library'
import { getActiveJobs } from '@/entities/site/lib/jobs'
import { getAllPublishedPosts } from '@/entities/site/lib/blog'

const BASE = 'https://www.edge8.ai'

// Site uses trailingSlash: true in next.config.mjs, so every canonical URL
// must end in '/'. Without this, Google does a 308 hop on every URL and
// burns crawl budget.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/about/', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/contact/', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/ai-programs/', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/8-edges-app/', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/8-edges-app/install/', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/caio-leadership/', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/global-staffing/', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/training-and-certification/', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/your-first-ai-hire/', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/blog/', priority: 0.8, changeFrequency: 'daily' },
    { path: '/careers/', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/workflows/', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/workflows/method/', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/legal/privacy/', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/eula/', priority: 0.3, changeFrequency: 'yearly' },
  ]

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))

  const caseStudyEntries: MetadataRoute.Sitemap = allCaseStudies.map((cs) => ({
    url: `${BASE}/case-studies/${cs.slug}/`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  // Static + DB-published posts. getAllPublishedPosts degrades to static-only on
  // a DB read failure, so the sitemap never fails the build.
  const postEntries: MetadataRoute.Sitemap = (await getAllPublishedPosts()).map((p) => ({
    url: `${BASE}/post/${p.slug}/`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const workflowEntries: MetadataRoute.Sitemap = allWorkflows.map((w) => ({
    url: `${BASE}/workflows/${w.slug}/`,
    lastModified: new Date(w.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Postings live in the ATS, so this list changes without a deploy.
  // getActiveJobs() returns [] on a read failure — the sitemap degrades to the
  // static routes rather than failing the build.
  const jobEntries: MetadataRoute.Sitemap = (await getActiveJobs()).map((j) => ({
    url: `${BASE}/careers/${j.slug}/`,
    lastModified: j.posted ? new Date(j.posted) : now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticEntries, ...caseStudyEntries, ...postEntries, ...workflowEntries, ...jobEntries]
}
