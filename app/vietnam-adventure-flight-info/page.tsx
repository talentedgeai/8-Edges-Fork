import FlightForm from './FlightForm'

export const metadata = {
  title: 'Vietnam Adventure — Flight Details',
  description: 'Submit your departure and arrival flight information for the Vietnam Adventure trip.',
  robots: { index: false, follow: false },
}

export default function FlightInfoPage() {
  return (
    <main>
      <section className="section" style={{ paddingTop: 80 }}>
        <div className="container" style={{ maxWidth: 680 }}>
          <span className="section-label">Vietnam Adventure</span>
          <h1 className="section-title" style={{ marginTop: 12 }}>
            Flight Details
          </h1>
          <p className="section-sub" style={{ marginTop: 16 }}>
            Please share your outbound and return flight information so we can arrange airport
            transfers and coordinate group arrivals. One submission per family.
          </p>
          <div style={{ marginTop: 40 }}>
            <FlightForm />
          </div>
        </div>
      </section>
    </main>
  )
}
