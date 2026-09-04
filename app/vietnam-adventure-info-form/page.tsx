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
    <main className="apply-page">
      <section className="apply-hero">
        <div className="container">
          <p className="apply-eyebrow brand-label">Edge8 Vietnam Adventure</p>
          <h1 className="apply-title">Travel info form</h1>
          <div className="apply-meta">
            <span>Tell us about your family, t-shirt sizes, and passports</span>
          </div>
        </div>
      </section>

      <section className="apply-form-section">
        <div className="container apply-form-wrap">
          <TripForm />
        </div>
      </section>
    </main>
  )
}
