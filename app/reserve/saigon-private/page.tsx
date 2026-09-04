import type { Metadata } from "next";
import Link from "next/link";
import { PrivateSessionReserve } from "@/components/PrivateSessionReserve";

export const metadata: Metadata = {
  title: "Reserve your retreat · Saigon private · Edge8",
  description:
    "Pick your days and team and reserve your Saigon private AI build retreat. The total updates live and your dates lock in the moment you pay.",
  alternates: { canonical: "/reserve/saigon-private" },
};

const INCLUDED = [
  { head: "The AIO Pad, riverside apartment", sub: "VIP immigration, car and driver, daily lunch, all included" },
  { head: "A Mac Mini with 8 working agents", sub: "Configured and yours to take home" },
  { head: "A dedicated AI engineer", sub: "Building beside you for the full retreat" },
  { head: "2 to 3 applications shipped", sub: "On your real data, to production" },
  { head: "The Polish", sub: "40 human tokens to perfect your builds after you fly home" },
];

const STEPS = [
  { n: "1", head: "Reserve and pay", sub: "Card via Stripe. Your dates lock in immediately." },
  { n: "2", head: "Pre-retreat consultation", sub: "We lock your scope before you fly, so day one is build day." },
  { n: "3", head: "You arrive and build", sub: "Quan hosts, the team builds it with you." },
];

export default function ReserveSaigonPrivatePage() {
  return (
    <main className="reserve-page">
      {/* Hero band */}
      <section className="reserve-hero">
        <div className="reserve-container">
          <span className="section-label">Saigon private retreat</span>
          <h1 className="reserve-title">Reserve your retreat</h1>
          <p className="reserve-subtitle">
            Pick your days and team. The total updates live, and your dates lock in the moment you
            pay. Changed your mind?{" "}
            <Link href="/saigon-private" className="reserve-inline-link">Back to the details</Link>.
          </p>
        </div>
      </section>

      {/* Body: recap + checkout */}
      <section className="reserve-body">
        <div className="reserve-container reserve-grid">
          {/* Left: what you get + trust + what happens next */}
          <div className="reserve-recap">
            <div>
              <span className="reserve-recap-label">What you get</span>
              <ul className="reserve-incl">
                {INCLUDED.map((it) => (
                  <li key={it.head}>
                    <span className="reserve-incl-check">✓</span>
                    <span>
                      <span className="reserve-incl-head">{it.head}</span>
                      <span className="reserve-incl-sub">{it.sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="reserve-risk">
              <p className="reserve-risk-head">Book with confidence</p>
              <p className="reserve-risk-body">
                Full refund up to 30 days before your start date. Inside 30 days, reschedule to any
                date in the next 6 months at no charge. Secure checkout via Stripe.
              </p>
            </div>

            <div>
              <span className="reserve-recap-label">What happens next</span>
              <ol className="reserve-steps">
                {STEPS.map((s) => (
                  <li key={s.n}>
                    <span className="reserve-step-num">{s.n}</span>
                    <span>
                      <span className="reserve-incl-head">{s.head}</span>
                      <span className="reserve-incl-sub">{s.sub}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right: the form (carries its own live total + Reserve button) */}
          <aside className="reserve-form-col">
            <PrivateSessionReserve />
          </aside>
        </div>
      </section>
    </main>
  );
}
