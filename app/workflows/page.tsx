import Link from 'next/link'
import { allWorkflows } from '@/lib/workflowsData'
import WorkflowsBrowser from './browser'

export default function WorkflowsPage() {
  return (
    <main>
      <section className="wf-hero">
        <div className="container">
          <div className="wf-hero-inner">
            <span className="section-label" style={{ background: 'color-mix(in srgb, var(--color-bg-primary) 10%, transparent)', color: 'color-mix(in srgb, var(--color-bg-primary) 80%, transparent)' }}>
              Operations, in the open
            </span>
            <h1 className="section-title">Workflows</h1>
            <p className="wf-hero-sub">
              The operating workflows we run Edge8 on, organized around our four offices: Revenue, Talent, Operations,
              and Innovation. Real systems documented end to end: who does what, when it happens, and where AI does the
              heavy lifting. This is how we run Edge8, and everything here is something we can build for you.
            </p>
          </div>
        </div>
      </section>

      <WorkflowsBrowser workflows={allWorkflows} />

      <section className="section" style={{ background: 'var(--dark)', padding: '72px 0' }}>
        <div className="container">
          <span className="section-label" style={{ background: 'color-mix(in srgb, var(--color-bg-primary) 10%, transparent)', color: 'color-mix(in srgb, var(--color-bg-primary) 80%, transparent)' }}>
            The method
          </span>
          <h2 className="section-title" style={{ fontSize: 32, color: 'var(--white)' }}>
            One method behind every page
          </h2>
          <p className="wf-hero-sub" style={{ marginTop: 12 }}>
            Every workflow here was planned with a 5D program brief, documented in seven elements, mapped step by step
            to humans and machines, tested with the New Hire Test, and shipped through three stage gates. It is the
            same method we teach in the AI Officer certification.
          </p>
          <div className="wf-hero-meta" style={{ marginBottom: 28 }}>
            <span className="wf-meta-chip">Plan <strong>5D Brief</strong></span>
            <span className="wf-meta-chip">Document <strong>7 elements</strong></span>
            <span className="wf-meta-chip">Assign <strong>Centaur Map</strong></span>
            <span className="wf-meta-chip">Ship <strong>3 stage gates</strong></span>
          </div>
          <Link href="/workflows/method" className="btn btn-mint">
            See how we design workflows →
          </Link>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 64 }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 className="section-title" style={{ fontSize: 30, marginBottom: 12 }}>
            Want workflows like these in your company?
          </h2>
          <p className="section-sub" style={{ margin: '0 auto 28px' }}>
            Every system on this page was designed, built, and put into production by Edge8. We do the same for our
            clients.
          </p>
          <Link href="/contact" className="btn btn-secondary">
            Talk to Edge8 →
          </Link>
        </div>
      </section>
    </main>
  )
}
