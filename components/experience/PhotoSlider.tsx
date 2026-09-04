"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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

export type Photo = { src: string; alt: string; caption?: string };

/**
 * A simple swipeable photo gallery for the experience sub-pages. Arrows on
 * desktop, swipe on touch, dot pagination, left/right keyboard, and
 * prefers-reduced-motion respected. No autoplay: the visitor drives it.
 */
export function PhotoSlider({ photos, ratio = "4 / 3" }: { photos: Photo[]; ratio?: string }) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();
  const touchX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // Keyboard arrows only when the gallery is focused or hovered, so it does
  // not hijack arrow keys for the rest of the page.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
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
    <div
      className="xp-gallery"
      ref={rootRef}
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label="The AIO Pad"
    >
      <div
        className="xp-gallery-viewport"
        style={{ aspectRatio: ratio }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="xp-gallery-track"
          style={{
            transform: `translateX(-${index * 100}%)`,
            transition: reduced ? "none" : "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {photos.map((p, i) => (
            <div className="xp-gallery-slide" key={i} aria-hidden={i !== index}>
              <Image
                src={p.src}
                alt={p.alt}
                fill
                sizes="(max-width: 800px) 100vw, 720px"
                style={{ objectFit: "cover" }}
              />
              {p.caption && <span className="xp-gallery-cap">{p.caption}</span>}
            </div>
          ))}
        </div>

        <button type="button" onClick={prev} aria-label="Previous photo" className="xp-arrow prev">
          <span aria-hidden>←</span>
        </button>
        <button type="button" onClick={next} aria-label="Next photo" className="xp-arrow next">
          <span aria-hidden>→</span>
        </button>
      </div>

      <div className="xp-gallery-dots">
        {photos.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index}
            className="xp-dot-hit"
          >
            <span className={i === index ? "xp-dot is-active" : "xp-dot"} />
          </button>
        ))}
      </div>
    </div>
  );
}
