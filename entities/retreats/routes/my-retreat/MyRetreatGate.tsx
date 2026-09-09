"use client";

import { useState } from "react";

// Two-stage soft gate (copy of the infinite-leverage WorkshopGate posture):
//   1. code     → validate the retreat access code.
//   2. identity → email only ("continue as a Client"); if the email isn't on
//                 file, reveal a name field and unlock as a first-timer.
//
// A first-timer unlocks in place (the API sets the cookie and returns the hub
// URL). A known client does not: their grant would carry a person_id, so the
// API replies { verificationSent: true } and mails a link instead, and this
// form switches to the check-your-email state.

type Stage = "code" | "identity" | "sent";

export function MyRetreatGate({
  initialCode = "",
  initialError = null,
}: {
  initialCode?: string;
  initialError?: string | null;
}) {
  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState(initialCode);
  const [title, setTitle] = useState<string>("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/my-retreat/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "That access code isn't recognized.");
        return;
      }
      setTitle(data.retreat?.title || "your retreat");
      setStage("identity");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/my-retreat/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, registration: { email, name: needName ? name : undefined } }),
      });
      const data = await res.json();
      if (res.status === 404 && data.needName) {
        setNeedName(true);
        setError("We don't have that email on file. Add your name to continue.");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't unlock your retreat.");
        return;
      }
      if (data.verificationSent) {
        setStage("sent");
        return;
      }
      window.location.href = data.redirect;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="site-gate-card">
      <h1 className="site-gate-title">
        {stage === "sent" ? "Check your email" : "Enter My Retreat"}
      </h1>
      <p className="site-gate-sub u-m-0">
        {stage === "code"
          ? "Enter the access code from your retreat invitation."
          : stage === "sent"
            ? `We sent a link to ${email}. Open it to continue to ${title}.`
            : `${title}. Enter your email to continue.`}
      </p>

      {error && <div className="site-gate-alert">{error}</div>}

      {stage === "sent" ? (
        <div className="u-stack u-gap-3">
          <p className="site-gate-note u-m-0">
            The link expires in 15 minutes. If it doesn&apos;t arrive, check your spam folder or
            try again.
          </p>
          <button
            type="button"
            className="site-gate-btn site-gate-btn--ghost"
            onClick={() => {
              setStage("identity");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      ) : stage === "code" ? (
        <form onSubmit={submitCode} className="u-stack u-gap-3">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="site-gate-input"
            aria-label="Access code"
          />
          <button type="submit" className="site-gate-btn" disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitIdentity} className="u-stack u-gap-3">
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="site-gate-input"
            aria-label="Email"
          />
          {needName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="site-gate-input"
              aria-label="Your name"
            />
          )}
          <button type="submit" className="site-gate-btn" disabled={busy || !email.trim() || (needName && !name.trim())}>
            {busy ? "Unlocking…" : "Enter"}
          </button>
        </form>
      )}
    </div>
  );
}

