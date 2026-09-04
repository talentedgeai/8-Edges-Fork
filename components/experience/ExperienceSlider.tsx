"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Subscribe to prefers-reduced-motion the React-idiomatic way. Avoids the
// setState-in-effect cascade and is SSR-safe (server snapshot = false).
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

// The retreat IS this site, so "Explore the retreat" points inward at the
// Saigon retreat page. AIO Pad is the external apartment site. Travel Buddy
// stays its own live product.
const RETREAT_HREF = "/saigon-private";
const AIO_PAD_URL = "https://www.aio-pad.com";
const TRAVEL_BUDDY_URL = "https://travelbuddy8.com";
const BASE = "/the-vietnam-experience";
const AUTOPLAY_MS = 5000;

type Cta = { label: string; href: string; primary?: boolean };
type Person = { name: string; title: string; href: string };

type Slide = {
  eyebrow: string;
  title: string;
  body: string[];
  image?: { src: string; alt: string };
  placeholder?: string;
  people?: Person[];
  teamNote?: { text: string; href: string };
  readMore?: { href: string; label: string };
  ctas?: Cta[];
};

const SLIDES: Slide[] = [
  {
    eyebrow: "The Vietnam Experience",
    title: "Three to five days of work. Every evening, Saigon is yours.",
    body: [
      "This is an AI retreat. 9am to 6pm, every day, you work with your AI Engineer and Quan your Retreat Host on AI and infinite leverage. Specialists join as needed. Real sessions, real output.",
      "When the day ends, the city begins. Food, music, shopping, rest. Saigon at night is the other half of the week.",
    ],
    image: { src: "/experience/welcome.jpg", alt: "The Saigon riverside at first light, ink-wash" },
    readMore: { href: `${BASE}/the-week`, label: "See the week" },
  },
  {
    eyebrow: "The Gift",
    title: "Most people leave Vietnam with photos.",
    body: [
      "You will leave with two things that last. A country in your heart, and a new operating system for your work: infinite leverage, the AI idea behind everything you touch this week.",
      "It is the difference between using AI and leading it. Once you watch a small team do the work of fifty, you cannot unsee it.",
    ],
    image: { src: "/experience/gift.jpg", alt: "A lotus opening over the Saigon skyline, ink-wash" },
    readMore: { href: `${BASE}/infinite-leverage`, label: "What infinite leverage means" },
  },
  {
    eyebrow: "The Arrival",
    title: "From the second you land.",
    body: [
      "No taxi line, no figuring it out. Someone meets you with your name and walks you through immigration while everyone else queues.",
      "Outside, Vu, your driver and a man this country calls a hero, holds the door of a silent electric VinFast. It was all arranged before you boarded, by the same AI you came to learn.",
    ],
    image: { src: "/experience/arrival.jpg", alt: "A car waiting on a misty Saigon boulevard, ink-wash" },
    readMore: { href: `${BASE}/arrival`, label: "Read the arrival story" },
  },
  {
    eyebrow: "The People",
    title: "The people who make it yours.",
    body: [
      "Not a hotel. A small team who built this for you, and learned your name before you arrived.",
    ],
    image: { src: "/experience/people.jpg", alt: "The team gathered around a table, ink-wash" },
    people: [
      { name: "Dave", title: "CAIO", href: `${BASE}/people/dave` },
      { name: "Quan", title: "Retreat Host", href: `${BASE}/people/quan` },
      { name: "Trac", title: "Lead Engineer", href: `${BASE}/people/trac` },
    ],
    teamNote: { text: "and the team: Tam, My, Kay and Luke", href: `${BASE}/people` },
  },
  {
    eyebrow: "The Place",
    title: "Saigon, and a neighborhood called Thao Dien.",
    body: [
      "Thao Dien is the leafy riverside pocket of the city. Espresso bars, weekend markets, the ritual of ca phe sua da, and the river turning gold at dusk.",
      "You will eat the best meal of your trip at a plastic table on a sidewalk, and learn why the people who live here never want to leave.",
    ],
    image: { src: "/experience/place.jpg", alt: "A Thao Dien riverside corner with coffee, ink-wash" },
    readMore: { href: `${BASE}/place`, label: "Explore the neighborhood" },
  },
  {
    eyebrow: "Travel Buddy",
    title: "A guide in your pocket.",
    body: [
      "Travel Buddy is your AI concierge. It knows where to eat, how to get there, and what is worth your time, so you are never standing on a corner wondering what is next.",
      "It is built by the same team running your week, a working example of the leverage you came to learn.",
    ],
    image: { src: "/experience/travel-buddy.jpg", alt: "A phone showing a map of Saigon, ink-wash" },
    readMore: { href: `${BASE}/travel-buddy`, label: "How Travel Buddy works" },
    ctas: [{ label: "Open Travel Buddy", href: TRAVEL_BUDDY_URL, primary: true }],
  },
  {
    eyebrow: "Infinite Leverage",
    title: "The idea you will take home.",
    body: [
      "The app that guides you, the home that runs itself, the small team doing the work of fifty. All one idea, made real with AI.",
      "Infinite leverage is building things that keep working without you. You work on it every day of the retreat. By the end, you will have something real and running.",
    ],
    image: { src: "/experience/infinite-leverage.jpg", alt: "Ripples multiplying from a lotus seed, ink-wash" },
    readMore: { href: `${BASE}/infinite-leverage`, label: "Go deeper" },
    ctas: [{ label: "Explore the retreat", href: RETREAT_HREF, primary: true }],
  },
  {
    eyebrow: "The Invitation",
    title: "Arrive as a guest. Leave changed.",
    body: [
      "Three to five days of focused AI work. Every evening, one of the world's most alive cities waiting outside the door.",
      "You will leave with something built, something learned, and a place in your heart that does not let go.",
    ],
    image: { src: "/experience/invitation.jpg", alt: "An open doorway onto the Saigon river, ink-wash" },
    ctas: [
      { label: "Explore the retreat", href: RETREAT_HREF, primary: true },
      { label: "Stay at AIO Pad", href: AIO_PAD_URL },
    ],
  },
];

export function ExperienceSlider() {
  const count = SLIDES.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const touchX = useRef<number | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || reduced) return;
    const id = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, reduced, next, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 48) (dx < 0 ? next : prev)();
    touchX.current = null;
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="The Vietnam Experience"
      className="xp-slider"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="xp-track"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: reduced ? "none" : "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {SLIDES.map((slide, i) => (
          <SlideView key={i} slide={slide} active={i === index} position={`${i + 1} / ${count}`} />
        ))}
      </div>

      <button type="button" onClick={prev} aria-label="Previous" className="xp-arrow prev">
        <span aria-hidden>←</span>
      </button>
      <button type="button" onClick={next} aria-label="Next" className="xp-arrow next">
        <span aria-hidden>→</span>
      </button>

      <div className="xp-controls">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          className="xp-play"
        >
          <span aria-hidden>{paused ? "▶" : "❚❚"}</span>
        </button>
        <div className="xp-dots">
          {SLIDES.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${s.eyebrow}`}
              aria-current={i === index}
              className="xp-dot-hit"
            >
              <span className={i === index ? "xp-dot is-active" : "xp-dot"} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideView({
  slide,
  active,
  position,
}: {
  slide: Slide;
  active: boolean;
  position: string;
}) {
  return (
    <div className="xp-slide" aria-hidden={!active}>
      <div className="xp-slide-inner">
        <div className="xp-slide-media">
          {slide.image ? (
            <Image
              src={slide.image.src}
              alt={slide.image.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              style={{ objectFit: "cover" }}
              priority={active}
            />
          ) : (
            <div className="xp-slide-placeholder">{slide.placeholder} · image soon</div>
          )}
        </div>

        <div className="xp-slide-copy">
          <p className="eyebrow">{slide.eyebrow}</p>
          <h2 className="xp-slide-title">{slide.title}</h2>
          <div className="xp-slide-body">
            {slide.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {slide.people && (
            <ul className="xp-people">
              {slide.people.map((person) => (
                <li key={person.name}>
                  <Link href={person.href}>
                    <span className="nm">{person.name}</span>
                    <span className="ti">{person.title}</span>
                    <span className="ar" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {slide.teamNote && (
            <p className="xp-teamnote">
              <Link href={slide.teamNote.href}>{slide.teamNote.text}</Link>
            </p>
          )}

          {slide.readMore && (
            <Link href={slide.readMore.href} className="xp-readmore">
              {slide.readMore.label}
              <span className="ar" aria-hidden>→</span>
            </Link>
          )}

          {slide.ctas && (
            <div className="xp-slide-ctas">
              {slide.ctas.map((cta) => {
                const external = !cta.href.startsWith("/");
                const cls = cta.primary ? "btn btn-primary" : "btn btn-ghost";
                const arrow = (
                  <span className="arrow" aria-hidden>{external ? "↗" : "→"}</span>
                );
                return external ? (
                  <a key={cta.label} href={cta.href} target="_blank" rel="noopener noreferrer" className={cls}>
                    {cta.label} {arrow}
                  </a>
                ) : (
                  <Link key={cta.label} href={cta.href} className={cls}>
                    {cta.label} {arrow}
                  </Link>
                );
              })}
            </div>
          )}

          <p className="xp-slide-pos">{position}</p>
        </div>
      </div>
    </div>
  );
}
