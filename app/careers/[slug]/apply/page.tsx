import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveJobs } from '@/lib/jobs'
import { companyOs } from '@/lib/supabase'
import ApplyForm from './ApplyForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const jobs = await getActiveJobs()
  const job = jobs.find((j) => j.slug === params.slug)
  return {
    title: job ? `Apply: ${job.title} | Edge8 Careers` : 'Apply | Edge8 Careers',
  }
}

export default async function ApplyPage({ params }: { params: { slug: string } }) {
  const jobs = await getActiveJobs()
  const job = jobs.find((j) => j.slug === params.slug)
  if (!job || !job.supabaseJobId) notFound()

  // Per-role screening questions (up to 3) live on the job requisition.
  const { data: reqRow } = await companyOs
    .from('job_requisitions')
    .select('application_questions')
    .eq('id', job.supabaseJobId)
    .maybeSingle()
  const questions: string[] = Array.isArray(reqRow?.application_questions)
    ? (reqRow.application_questions as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 3)
    : []

  return (
    <main className="apply-page">
      <section className="apply-hero">
        <div className="container">
          <Link href="/careers/" className="apply-back">← Back to careers</Link>
          <p className="apply-eyebrow">Apply for this role</p>
          <h1 className="apply-title">{job.title}</h1>
          <div className="apply-meta">
            <span>{job.department}</span>
            <span className="apply-meta-sep">·</span>
            <span>{job.location}</span>
            <span className="apply-meta-sep">·</span>
            <span>{job.type}</span>
          </div>
        </div>
      </section>

      <section className="apply-form-section">
        <div className="container apply-form-wrap">
          <ApplyForm
            jobId={job.supabaseJobId}
            jobTitle={job.title}
            jobSlug={job.slug}
            questions={questions}
          />
        </div>
      </section>
    </main>
  )
}
