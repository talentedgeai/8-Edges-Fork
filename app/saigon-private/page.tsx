import type { Metadata } from "next";
import RevealObserver from "@/app/careers/RevealObserver";
import Link from "next/link";
import { VideoCarousel } from "@/components/VideoCarousel";
import { PhotoSlider } from "@/components/experience/PhotoSlider";
import {
  FAQS,
  FILTER_BULLETS,
  INCLUDED,
  NOT_INCLUDED,
  OUTCOMES,
  PROGRAMS,
  PROOF,
  VALUE_STACK,
  VALUE_TOTAL,
} from "@/lib/private-session";
import { faqPageSchema, jsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Private AI Build Retreats in Saigon · Edge8",
  description:
    "A private 3, 4 or 5 day build retreat in Saigon. Walk in with an idea, fly home with 2 to 3 working applications on a Mac Mini, plus 8 working agents and 30 days of polish. From $7,000 USD.",
  keywords: [
    "private AI build retreat",
    "private AI sprint Saigon",
    "AI build sprint Vietnam",
    "founder team build retreat",
    "Edge8 private retreat",
  ],
  alternates: { canonical: "/saigon-private" },
  openGraph: {
    title: "Private AI Build Retreats in Saigon · Edge8",
    description:
      "Fly to Saigon. Fly home with the software your business runs on. 3, 4 or 5 days, private, from $7,000.",
    url: "/saigon-private",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Private AI Build Retreats in Saigon",
    description: "Fly to Saigon. Fly home with the software your business runs on.",
  },
};

export default function SaigonPrivatePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(faqPageSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))))}
      />
      <RevealObserver />
      {/* ═══ HERO ═══ */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-eyebrow">Private Retreat · Saigon, Vietnam · 3–5 days</div>
            <h1 className="hero-headline">
              Fly to Saigon. Fly home with the software{" "}
              <span className="accent">your business runs on.</span>
            </h1>
            <p className="hero-sub">
              Most founders spend $20,000 and six months hiring developers to build one app. In 3 to
              5 days, with engineers beside you, you walk out with two or three working applications
              on your real data, a Mac Mini running 8 AI agents, and the system to keep building
              forever. The flights aside, everything is handled. You just build.
            </p>
            <div className="hero-actions" style={{ marginTop: 32 }}>
              <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
              <a href="#value" className="btn btn-ghost-light">See what you get</a>
            </div>
            <p style={{ marginTop: 18 }}>
              <Link href="/the-vietnam-experience" className="text-link" style={{ display: "inline-flex" }}>
                Or see what a week in Saigon is like →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ═══ */}
      <section className="hero-stats" aria-label="What a private retreat delivers">
        <div className="container">
          <div className="hero-stats-grid rt-stats-4">
            <div className="hero-stat reveal">
              <div className="hero-stat-number">$7K</div>
              <div className="hero-stat-label">Starting price</div>
              <div className="hero-stat-sub">USD · 3-day, first person</div>
            </div>
            <div className="hero-stat reveal">
              <div className="hero-stat-number">2–3</div>
              <div className="hero-stat-label">Apps you ship</div>
              <div className="hero-stat-sub">live on your real data before you fly home</div>
            </div>
            <div className="hero-stat reveal">
              <div className="hero-stat-number">8</div>
              <div className="hero-stat-label">Agents on a Mac Mini</div>
              <div className="hero-stat-sub">configured and yours to take home</div>
            </div>
            <div className="hero-stat reveal">
              <div className="hero-stat-number">3–5</div>
              <div className="hero-stat-label">Days, fully private</div>
              <div className="hero-stat-sub">just you, or you and your team</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HERO REEL ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="rt-video reveal">
            <iframe
              src="https://www.youtube.com/embed/Iw6MySwudEo?rel=0"
              title="What a private retreat produces"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ═══ THE REFRAME ═══ */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">Read this first</span>
            <h2 className="section-title">
              You&rsquo;re not buying a course. You&rsquo;re buying an <span className="accent">asset.</span>
            </h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              A dev shop charges $20,000 to $50,000 to build one CRM. You leave with two or three
              working apps. An AI bootcamp is $5,000 and you go home with a notebook. This is days and
              thousands, and the software is already live before your flight home.
            </p>
          </div>
          <div className="engage-grid reveal" style={{ marginTop: 48 }}>
            <CompareCard label="Hire a dev shop" cost="$20K – $50K" detail="Per app. Months of waiting. You own a contract, not the skill." />
            <CompareCard label="Take an AI bootcamp" cost="Up to $5K" detail="You leave with notes and prompts. Nothing shipped." />
            <CompareCard label="The Saigon retreat" cost="From $7K" detail="2 to 3 apps live, a Mac Mini with 8 agents, and you can do it again." featured />
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="section">
        <div className="container">
          <div className="reveal" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 48px" }}>
            <span className="section-label">In their own words</span>
            <h2 className="section-title">See what founders <span className="accent">have to say.</span></h2>
          </div>
          <VideoCarousel videos={[
            { id: "jRwrSYlaO4Q", title: "Edge8 proof of concept" },
            { id: "fXCe3vSkzVo", title: "Edge8 founder story" },
            { id: "YSP6Xt0UEyk", title: "Edge8 testimonial" },
            { id: "9g6bhTIJeKA", title: "Melbourne founder testimonial" },
          ]} />
        </div>
      </section>

      {/* ═══ WHO YOU'RE WORKING WITH ═══ */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760, marginBottom: 48 }}>
            <span className="section-label">Who you&rsquo;re working with</span>
            <h2 className="section-title">The people who <span className="accent">make it yours.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Not a hotel. A small team who built this for you, and learned your name before you arrived.
            </p>
          </div>
          {/* Quan — featured */}
          <div className="meet-dave">
            <div className="reveal">
              <span className="section-label">Retreat Host</span>
              <h3 className="section-title" style={{ fontSize: 30, marginTop: 4 }}>Quan</h3>
              <p style={{ fontSize: 17, color: "var(--grey-mid)", lineHeight: 1.75, marginTop: 16 }}>
                Quan is the Retreat Host. He is the reason the week feels effortless: the car is
                there, the table is booked, and you never think about logistics.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/saigon-private/quan.jpg" alt="Quan, Retreat Host at Edge8" className="meet-dave-img reveal" />
          </div>
          {/* Dave + Trac — secondary */}
          <div className="rt-team-secondary">
            <div className="rt-team-card reveal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/dave-headshot.webp" alt="Dave Hajdu, Founder & CAIO" />
              <div>
                <span className="nm">Dave</span>
                <span className="ti">CAIO</span>
                <p>
                  Dave is your host and the CAIO. He spent years learning to lead AI rather than
                  chase it, and built the retreat to hand that to other people.
                </p>
              </div>
            </div>
            <div className="rt-team-card reveal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/saigon-private/trac.jpg" alt="Trac, Lead Engineer" />
              <div>
                <span className="nm">Trac</span>
                <span className="ti">Lead Engineer</span>
                <p>
                  Trac leads the engineering. He and the team build the AI that runs the apartment,
                  guides you through the city, and arranges your arrival before you land.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INSIDE THE RETREAT (CAROUSEL) ═══ */}
      <section className="section">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760, marginBottom: 32 }}>
            <span className="section-label">Inside the retreat</span>
            <h2 className="section-title">Heads down, <span className="accent">and together.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Real founders and engineers, building side by side and breaking for lunch, through a
              week in Saigon.
            </p>
          </div>
          <div className="reveal" style={{ maxWidth: 880, margin: "0 auto" }}>
            <PhotoSlider
              ratio="3 / 2"
              photos={[
                { src: "/images/saigon-private/retreat/engineers-coaching.jpg", alt: "An engineer coaching a founder through a build in Saigon" },
                { src: "/images/saigon-private/retreat/group-selfie.jpg", alt: "The retreat group together in Saigon" },
                { src: "/images/saigon-private/retreat/group-lunch.jpg", alt: "The team and founders sharing lunch" },
                { src: "/images/saigon-private/retreat/working-session.jpg", alt: "A working session in progress" },
                { src: "/images/saigon-private/retreat/team-skyline.jpg", alt: "The Edge8 team with the Saigon skyline" },
                { src: "/images/saigon-private/retreat/team-lunch.jpg", alt: "Breaking for a shared meal" },
                { src: "/images/saigon-private/retreat/students-working.jpg", alt: "Founders building side by side" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ═══ WHAT YOU WALK OUT WITH ═══ */}
      <section className="section">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">What you walk out with</span>
            <h2 className="section-title">Real software, <span className="accent">running on your data.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Past teams have walked out with {PROOF.apps.join(", ")}, and more. {PROOF.line}
            </p>
          </div>
          <div className="rt-outcomes reveal">
            {OUTCOMES.map((o) => (
              <div className="rt-outcome" key={o.label}>
                <span className="rt-outcome-num">{o.label}</span>
                <h3 className="rt-outcome-title">{o.heading}</h3>
                <p className="rt-outcome-desc">{o.desc}</p>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 40 }}>
            <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
          </div>
        </div>
      </section>

      {/* ═══ VALUE STACK ═══ */}
      <section className="section" id="value" style={{ background: "var(--white)", scrollMarginTop: 80 }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">The math</span>
            <h2 className="section-title">Here&rsquo;s everything <span className="accent">you get.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Priced at what each piece costs on its own. Add it up, then look at what you pay. That
              gap is the whole point.
            </p>
          </div>

          <div className="rt-stack reveal">
            <ul className="rt-stack-list">
              {VALUE_STACK.map((row) => (
                <li key={row.item}>
                  <span className="rt-stack-item">
                    <span className="rt-stack-check">✓</span>
                    {row.item}
                  </span>
                  <span className="rt-stack-value">{row.value}</span>
                </li>
              ))}
            </ul>

            <div className="rt-price-box">
              <div>
                <div className="rt-price-label">Total real value</div>
                <div className="rt-price-strike">{VALUE_TOTAL}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="rt-price-label rt-price-label--accent">Your investment</div>
                <div className="rt-price-big">From $7,000</div>
              </div>
            </div>
            <p className="rt-stack-note">
              $7,000 for a 3-day retreat, first person. Each extra day is $1,000. Each additional
              person is $1,000 per day, everything included. Build a $50,000 software stack for the
              price most people pay to learn about AI, then keep building after you land.
            </p>
            <div style={{ marginTop: 28 }}>
              <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ IS THIS YOU ═══ */}
      <section className="section">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">Is this you</span>
            <h2 className="section-title">Built for founders <span className="accent">done waiting.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              A private retreat is for an operator ready to build the thing they have been saying they
              would build for two years, solo or with their team.
            </p>
          </div>
          <ul className="rt-checks reveal">
            {FILTER_BULLETS.map((line) => (
              <li key={line}><span className="rt-check">✓</span>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ RESERVE CTA ═══ */}
      <section className="section" id="reserve" style={{ background: "var(--tint)", scrollMarginTop: 80 }}>
        <div className="container">
          <div className="reveal" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>
            <span className="section-label">Reserve a private retreat</span>
            <h2 className="section-title">Pick your days and team, then reserve.</h2>
            <p className="section-sub" style={{ marginTop: 16, marginLeft: "auto", marginRight: "auto" }}>
              The total updates live as you adjust. Pay by card via Stripe and your dates lock in
              immediately.
            </p>
            <div className="hero-actions" style={{ justifyContent: "center", marginTop: 28 }}>
              <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PROGRAMME ═══ */}
      <section className="section" id="programme">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">Programme</span>
            <h2 className="section-title">What every day <span className="accent">looks like.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Every retreat starts with a private CAIO roadmap session and ends with a live production
              deployment. The 3-day ships a focused build; 4 and 5 days add more build time and a
              dedicated launch day.
            </p>
          </div>
          <ProgramBlock label="The 3-day arc" days={PROGRAMS["3day"]} />
          <ProgramBlock label="The 5-day arc" days={PROGRAMS["5day"]} />
        </div>
      </section>

      {/* ═══ INCLUDED / NOT ═══ */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">What&rsquo;s in the price</span>
            <h2 className="section-title">Included, <span className="accent">and not included.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Everything the retreat needs to put working software in your hands is included. Things
              that scale with your business after, ads, ongoing API costs, domain renewals, are not.
            </p>
          </div>
          <div className="rt-incl-cols reveal">
            <IncludeCard label="Included" lines={INCLUDED} positive />
            <IncludeCard label="Not included" lines={NOT_INCLUDED} positive={false} />
          </div>
          <div className="reveal" style={{ marginTop: 40 }}>
            <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
          </div>
        </div>
      </section>

      {/* ═══ WHERE YOU STAY ═══ */}
      <section className="section">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">Where you stay</span>
            <h2 className="section-title">AIO-pad, <span className="accent">Lumiere Riverside.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Your team stays at the AIO-pad in Lumiere Riverside, in the leafy Thao Dien neighborhood
              of Saigon. Riverside views, a private car and driver, and the Travel Buddy app for
              everything else. 20 minutes to District 1.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
              <Link href="/the-vietnam-experience/place" className="btn btn-ghost-light">
                Explore the neighborhood →
              </Link>
              <a href="https://www.aio-pad.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost-light">
                See the apartments at aio-pad.com →
              </a>
            </div>
          </div>
          <div className="rt-stay-grid reveal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/saigon-private/apartment.jpg" alt="Two-bedroom apartment at the AIO-pad in Lumiere Riverside" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/saigon-private/pool.avif" alt="The 50-metre rooftop pool at Lumiere Riverside" />
          </div>
        </div>
      </section>

      {/* ═══ THE VIETNAM EXPERIENCE TEASER ═══ */}
      <section className="section" style={{ background: "var(--tint)" }}>
        <div className="container">
          <div className="rt-xp-teaser reveal">
            <div className="rt-xp-teaser-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/experience/welcome.jpg" alt="The Saigon riverside at first light" />
            </div>
            <div className="rt-xp-teaser-copy">
              <span className="section-label">The Vietnam Experience</span>
              <h2 className="section-title">The week is more than <span className="accent">the build.</span></h2>
              <p className="section-sub" style={{ marginTop: 16 }}>
                9am to 6pm you build. Every evening, Saigon is yours, the food, the river, the city.
                VIP arrival, a private driver, and the AIO-pad in Thao Dien. See what a week here is
                really like.
              </p>
              <Link href="/the-vietnam-experience" className="btn btn-ghost-light" style={{ marginTop: 24 }}>
                Explore The Vietnam Experience →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ THE POLISH ═══ */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">After you fly home</span>
            <h2 className="section-title">The Polish. <span className="accent">We don&rsquo;t ship and ghost.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Working is not the same as production. Every retreat includes 40 human tokens, about 40
              hours of expert time, for the 30 days after you leave. Our team uses them to take your
              builds to production quality, fix the edge cases, and, if there is room, build the next
              thing with you.
            </p>
          </div>
          <div className="engage-transparency reveal" style={{ marginTop: 48 }}>
            <div className="engage-transparency-eyebrow">The 30 days after</div>
            <div className="engage-transparency-list">
              <div className="engage-transparency-item">
                <strong>40 human tokens included</strong>
                <span>~40 hours of expert polish, free for 30 days</span>
              </div>
              <div className="engage-transparency-item">
                <strong>$2K per month to keep going</strong>
                <span>40 more tokens every month, cancel anytime</span>
              </div>
              <div className="engage-transparency-item">
                <strong>2 meters, one dashboard</strong>
                <span>Claude tokens and human tokens, side by side</span>
              </div>
            </div>
            <p className="engage-transparency-line">
              Want to keep building after the first month? The Human Tokens subscription is $2,000 a
              month for 40 tokens, cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">FAQ</span>
            <h2 className="section-title">Common <span className="accent">questions.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>
              Not answered here? Email{" "}
              <a href="mailto:quan@edge8.ai" className="text-link" style={{ display: "inline" }}>quan@edge8.ai</a>{" "}
              and we will reply within a business day.
            </p>
          </div>
          <div className="rt-faq reveal">
            {FAQS.map((it, i) => (
              <details className="rt-faq-item" key={i}>
                <summary>
                  <span>{it.q}</span>
                  <span className="rt-faq-toggle">+</span>
                </summary>
                <div className="rt-faq-body">{it.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="audit-cta section">
        <div className="container">
          <div className="audit-inner">
            <div className="audit-text reveal">
              <h2 className="section-title">Reserve your private retreat.</h2>
              <p>Fly to Saigon. Fly home with the software your business runs on. From $7,000.</p>
            </div>
            <div className="audit-cta-btn reveal">
              <Link href="/reserve/saigon-private" className="btn btn-primary">Reserve a retreat →</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function CompareCard({ label, cost, detail, featured }: { label: string; cost: string; detail: string; featured?: boolean }) {
  return (
    <div className={`engage-card${featured ? " featured" : ""}`}>
      <span className="engage-tag">{label}</span>
      <span className="rt-compare-cost">{cost}</span>
      <p className="engage-desc">{detail}</p>
    </div>
  );
}

function ProgramBlock({ label, days }: { label: string; days: Array<{ num: string; title: string; sub: string; items: string[] }> }) {
  return (
    <div className="rt-program">
      <span className="rt-program-label">{label}</span>
      <div className="rt-day-grid">
        {days.map((day) => (
          <div key={day.num} className="rt-day-card">
            <div className="rt-day-meta">
              <span className="rt-day-num">{day.num}</span>
              <span className="rt-day-sub">{day.sub}</span>
            </div>
            <h3 className="rt-day-title">{day.title}</h3>
            <ul className="rt-day-list">
              {day.items.map((item) => (
                <li key={item}><span className="rt-day-dot" />{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncludeCard({ label, lines, positive }: { label: string; lines: string[]; positive: boolean }) {
  return (
    <div className="rt-incl-card">
      <span className={`rt-incl-label${positive ? "" : " rt-incl-label--neg"}`}>{label}</span>
      <ul className="rt-incl-list">
        {lines.map((line) => (
          <li key={line}>
            <span className={positive ? "rt-incl-yes" : "rt-incl-no"}>{positive ? "✓" : "×"}</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
