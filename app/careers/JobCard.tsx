import Link from 'next/link'

type Job = {
  slug: string
  title: string
  department: string
  location: string
  type: string
  excerpt: string
  applyEmail: string
  supabaseJobId: string | null
  featured: boolean
  contentHtml: string
}

export default function JobCard({ job }: { job: Job }) {
  const deptSlug = job.department
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  const applyHref = job.supabaseJobId
    ? `/careers/${job.slug}/apply/`
    : `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`

  return (
    <div className={`site-job-card reveal${job.featured ? ' featured' : ''}`}>
      <div className="site-job-card-tags">
        <span className={`site-job-dept dept-${deptSlug}`}>{job.department}</span>
        {job.featured && <span className="site-job-badge-featured">Featured</span>}
      </div>

      <h3 className="site-job-title">
        <Link href={`/careers/${job.slug}/`}>{job.title}</Link>
      </h3>

      <div className="site-job-meta">
        <span className="site-job-meta-item">{job.location}</span>
        <span className="site-job-meta-sep">·</span>
        <span className="site-job-meta-item">{job.type}</span>
      </div>

      <p className="site-job-excerpt">{job.excerpt}</p>

      <div className="site-job-card-actions">
        <Link href={`/careers/${job.slug}/`} className="btn site-btn-outline site-job-toggle-btn">
          View Role Details
        </Link>
        <a href={applyHref} className="btn btn-primary site-job-apply-btn">
          Apply Now →
        </a>
      </div>
    </div>
  )
}
