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
    <div style={card}>
      <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>
        {stage === "sent" ? "Check your email" : "Enter My Retreat"}
      </h1>
      <p style={{ margin: "0 0 18px", opacity: 0.75, fontSize: 15 }}>
        {stage === "code"
          ? "Enter the access code from your retreat invitation."
          : stage === "sent"
            ? `We sent a link to ${email}. Open it to continue to ${title}.`
            : `${title}. Enter your email to continue.`}
      </p>

      {error && <div style={alert}>{error}</div>}

      {stage === "sent" ? (
        <div style={form}>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 14 }}>
            The link expires in 15 minutes. If it doesn&apos;t arrive, check your spam folder or
            try again.
          </p>
          <button
            type="button"
            style={{ ...button, background: "transparent", color: "var(--ink, var(--color-primary-dark))", border: "1px solid color-mix(in srgb, var(--color-primary-dark) 18%, transparent)" }}
            onClick={() => {
              setStage("identity");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      ) : stage === "code" ? (
        <form onSubmit={submitCode} style={form}>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            style={input}
            aria-label="Access code"
          />
          <button type="submit" style={button} disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitIdentity} style={form}>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={input}
            aria-label="Email"
          />
          {needName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={input}
              aria-label="Your name"
            />
          )}
          <button type="submit" style={button} disabled={busy || !email.trim() || (needName && !name.trim())}>
            {busy ? "Unlocking…" : "Enter"}
          </button>
        </form>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  maxWidth: 420,
  margin: "0 auto",
  padding: "28px 26px",
  border: "1px solid color-mix(in srgb, var(--color-primary-dark) 10%, transparent)",
  borderRadius: 14,
  background: "var(--paper, var(--color-bg-primary))",
};
const form: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const input: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 10,
  border: "1px solid color-mix(in srgb, var(--color-primary-dark) 18%, transparent)",
  width: "100%",
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 10,
  border: "none",
  background: "var(--ink, var(--color-primary-dark))",
  color: "var(--color-bg-primary)",
  cursor: "pointer",
};
const alert: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--color-err-strong) 8%, transparent)",
  color: "var(--color-err-ink)",
  fontSize: 14,
};
