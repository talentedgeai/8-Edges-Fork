import TripForm from './TripForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Vietnam Adventure — Travel Info Form | Edge8',
  description:
    'Submit your family details, t-shirt sizes, and (securely) passport photos for the Edge8 Vietnam adventure.',
  robots: { index: false, follow: false },
}

export default function VietnamAdventureInfoFormPage() {
  return (
    <main className="site-apply-page">
      <section className="site-apply-hero">
        <div className="container">
          <p className="site-apply-eyebrow site-brand-label">Edge8 Vietnam Adventure</p>
          <h1 className="site-apply-title">Travel info form</h1>
          <div className="site-apply-meta">
            <span>Tell us about your family, t-shirt sizes, and passports</span>
          </div>
        </div>
      </section>

      <section className="site-apply-form-section">
        <div className="container site-apply-form-wrap">
          <TripForm />
        </div>
      </section>
    </main>
  )
}
