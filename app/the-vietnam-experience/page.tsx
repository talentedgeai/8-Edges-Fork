import type { Metadata } from "next";
import Link from "next/link";
import RevealObserver from "@/app/careers/RevealObserver";
import { ExperienceSlider } from "@/components/experience/ExperienceSlider";

export const metadata: Metadata = {
  title: "The Vietnam Experience · Edge8",
  description:
    "You came for an AI Retreat. You will leave with a new way to live. The people, the place, and the idea behind your week in Saigon.",
  alternates: { canonical: "/the-vietnam-experience" },
};

const CHAPTERS = [
  { title: "The Week", desc: "Three to five days, shaped hour by hour.", href: "/the-vietnam-experience/the-week" },
  { title: "The Arrival", desc: "VIP from the second you land.", href: "/the-vietnam-experience/arrival" },
  { title: "The Place", desc: "Saigon, and a neighborhood called Thao Dien.", href: "/the-vietnam-experience/place" },
  { title: "Travel Buddy", desc: "Your AI concierge, in your pocket.", href: "/the-vietnam-experience/travel-buddy" },
  { title: "Infinite Leverage", desc: "The AI idea you take home.", href: "/the-vietnam-experience/infinite-leverage" },
  { title: "The People", desc: "The team who make it yours.", href: "/the-vietnam-experience/people" },
];

export default function VietnamExperiencePage() {
  return (
    <main className="xp-page">
      <RevealObserver />
      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-eyebrow">An AI retreat in Saigon</div>
            <h1 className="hero-headline">
              The <span className="accent">Vietnam Experience</span>
            </h1>
            <p className="hero-sub">
              You came for an AI Retreat. You will leave with a new way to live.
            </p>
          </div>
        </div>
      </section>

      {/* The slider */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="xp-stage reveal">
            <ExperienceSlider />
          </div>
        </div>
      </section>

      {/* Explore the chapters → sub-pages */}
      <section className="section" style={{ background: "var(--white)" }}>
        <div className="container">
          <div className="reveal" style={{ maxWidth: 760 }}>
            <span className="section-label">The chapters</span>
            <h2 className="section-title">Explore the <span className="accent">experience.</span></h2>
            <p className="section-sub" style={{ marginTop: 16 }}>Step into any part of the week.</p>
          </div>

          <div className="xp-chapters reveal">
            {CHAPTERS.map((c) => (
              <Link key={c.href} href={c.href} className="xp-card">
                <div className="xp-card-top">
                  <h3>{c.title}</h3>
                  <span className="ar" aria-hidden>→</span>
                </div>
                <p>{c.desc}</p>
              </Link>
            ))}
          </div>

          <div className="reveal" style={{ marginTop: 48 }}>
            <Link href="/saigon-private" className="btn btn-primary">
              Explore the retreat <span className="arrow" aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
