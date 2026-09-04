import FlightForm from './FlightForm'

export const metadata = {
  title: 'Vietnam Adventure — Flight Details',
  description: 'Submit your departure and arrival flight information for the Vietnam Adventure trip.',
  robots: { index: false, follow: false },
}

export default function FlightInfoPage() {
  return (
    <main>
      <section className="section site-section--tight-top">
        <div className="container site-container--narrow">
          <span className="site-section-label">Vietnam Adventure</span>
          <h1 className="site-section-title u-mt-3">
            Flight Details
          </h1>
          <p className="site-section-sub u-mt-4">
            Please share your outbound and return flight information so we can arrange airport
            transfers and coordinate group arrivals. One submission per family.
          </p>
          <div className="u-mt-7">
            <FlightForm />
          </div>
        </div>
      </section>
    </main>
  )
}
