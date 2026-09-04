import { getAllPublishedPosts } from '@/lib/blog'
import { allCaseStudies } from '@/lib/caseStudies'
import { allWorkflows } from '@/lib/workflowsData'

const BASE = 'https://www.edge8.ai'

// Served at /llms.txt — a curated, machine-readable map of the site for LLMs and
// AI search engines (the llms.txt convention: https://llmstxt.org).
// Generated from the same data as sitemap.ts so the article index never drifts.
// Page URLs keep the trailing slash to match trailingSlash:true and avoid 308 hops;
// /llms.txt itself has a file extension, so Next serves it without a trailing slash.

export const dynamic = 'force-static'

// Edge8 groups AI work around four offices. The article index mirrors this order.
const CATEGORY_ORDER = ['Revenue', 'Talent', 'Operations', 'Innovation'] as const

const SERVICES = [
  { path: '/your-first-ai-hire/', name: 'Your First AI Hire', desc: 'Plan, build, and deploy your first production AI agent.' },
  { path: '/caio-leadership/', name: 'CAIO Leadership', desc: 'Fractional Chief AI Officer (CAIO) leadership to set AI strategy and drive adoption.' },
  { path: '/global-staffing/', name: 'Global Staffing', desc: 'Dedicated, AI-skilled global talent staffing across the US and Southeast Asia.' },
  { path: '/training-and-certification/', name: 'Training & Certification', desc: 'AI Officer certification and team training programs.' },
]

const COMPANY = [
  { path: '/about/', name: 'About Edge8', desc: "Edge8's mission, approach, and the team behind it." },
  { path: '/blog/', name: 'Blog', desc: 'Articles on AI leadership, programs, talent, and operations.' },
  { path: '/careers/', name: 'Careers', desc: 'Open roles and how to work with Edge8.' },
  { path: '/contact/', name: 'Contact', desc: 'Talk to Edge8 about AI leadership, programs, and staffing.' },
]

function link(path: string, name: string, desc?: string) {
  return `- [${name}](${BASE}${path})${desc ? `: ${desc}` : ''}`
}

export async function GET() {
  const allPosts = await getAllPublishedPosts()
  const lines: string[] = []

  lines.push('# Edge8')
  lines.push('')
  lines.push(
    '> Edge8 helps organizations become Tech-Forward through AI Leadership, AI Programs, and global AI talent — achieving 8x efficiency. Founded by Dave Hajdu, Edge8 provides fractional Chief AI Officer (CAIO) leadership, enterprise AI programs, AI Officer certification, and AI talent staffing across the US and Southeast Asia (Vietnam, Singapore, Malaysia).'
  )
  lines.push('')
  lines.push(
    'Edge8 organizes AI work around four offices — Revenue, Talent, Operations, and Innovation. The article index below is grouped the same way.'
  )
  lines.push('')

  lines.push('## Services')
  for (const s of SERVICES) lines.push(link(s.path, s.name, s.desc))
  lines.push('')

  lines.push('## Case Studies — AI Programs')
  lines.push(link('/ai-programs/', 'AI Programs', 'Overview of enterprise AI programs Edge8 has delivered.'))
  for (const cs of allCaseStudies) {
    lines.push(`- [${cs.title}](${BASE}/case-studies/${cs.slug}/): ${cs.subtitle}`)
  }
  lines.push('')

  lines.push('## Company')
  for (const c of COMPANY) lines.push(link(c.path, c.name, c.desc))
  lines.push('')

  lines.push('## Workflows')
  lines.push(link('/workflows/', 'Workflows', 'The operating workflows Edge8 runs on, documented end to end.'))
  lines.push(
    link(
      '/workflows/method/',
      'How We Design Workflows',
      'The Edge8 method: 5D program brief, seven workflow elements, the Centaur Map, the New Hire Test, and three stage gates.'
    )
  )
  for (const w of allWorkflows) {
    lines.push(`- [${w.title}](${BASE}/workflows/${w.slug}/): ${w.excerpt}`)
  }
  lines.push('')

  for (const cat of CATEGORY_ORDER) {
    const posts = allPosts.filter((p) => p.category === cat)
    if (posts.length === 0) continue
    lines.push(`## Articles: ${cat}`)
    for (const p of posts) lines.push(`- [${p.title}](${BASE}/post/${p.slug}/)`)
    lines.push('')
  }

  lines.push('## Optional')
  lines.push(link('/sitemap.xml', 'Sitemap', 'Complete list of all indexed URLs.'))
  lines.push('- [LinkedIn](https://www.linkedin.com/company/edge8ai/): Edge8 on LinkedIn.')
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
