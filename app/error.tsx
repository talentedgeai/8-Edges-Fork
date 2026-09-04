"use client";

import { useEffect } from "react";

// Site-wide error boundary. Sits inside the root layout, so SiteFrame's nav
// and footer stay around it. Must be a client component (Next passes
// { error, reset } to it).
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error reporter yet; the digest is what Vercel's logs key on.
    console.error("[site] route error", error.digest ?? error.message, error);
  }, [error]);

  return (
    <section className="section">
      <div className="container u-center-text">
        <h1 className="site-section-title site-section-title--sm">Something went wrong</h1>
        <p className="site-section-sub site-section-sub--centered">
          This page hit an error while loading. Trying again usually fixes it.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </section>
  );
}
