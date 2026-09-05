"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";
import { PasswordField } from "@/kernel/ui/PasswordField";
import { requestSignInLink, requestPasswordReset } from "./actions";

// Password sign-in for client contacts is the default, with a magic-link
// (passwordless) alternative plus a self-serve password reset. The link and reset emails are
// sent server-side (see ./actions.ts) through the /portal/verify interstitial:
// corporate mail security (e.g. Microsoft Safe Links) prefetches raw one-time
// links and consumes the token before the person can click, so the emailed
// link must redeem only on a button press. Accounts are never created here —
// they are minted only by an admin invite — and every notice is deliberately
// neutral so the form cannot be used to enumerate who has an account.
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"link" | "password">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That sign-in link was invalid or expired. Request a new one below." : null,
  );
  const [sent, setSent] = useState<"link" | "reset" | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestSignInLink(email);
    } catch {
      setError("Something went wrong sending your link. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    // Neutral response regardless of whether an account exists.
    setSent("link");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setError("That email and password combination did not work.");
      setLoading(false);
      return;
    }
    // Full navigation so the middleware + server layout re-run with the new cookie.
    router.replace("/portal");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email above first, then press Forgot password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email);
    } catch {
      setError("Something went wrong sending the reset link. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    setSent("reset");
  }

  if (sent) {
    return (
      <div className="admin-alert admin-alert--ok">
        {sent === "link"
          ? `If an account exists for ${email.trim().toLowerCase()}, a sign-in link is on its way. Check your email and press the button in it to sign in.`
          : `If an account exists for ${email.trim().toLowerCase()}, a password reset link is on its way. Check your email and press the button in it to choose a new password.`}
      </div>
    );
  }

  if (mode === "password") {
    return (
      <form className="admin-form" onSubmit={handlePasswordSubmit}>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        <div className="admin-field">
          <label className="admin-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="admin-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <div className="admin-label-row">
            <label className="admin-label" htmlFor="password">Password</label>
            <button
              type="button"
              className="admin-auth-link"
              disabled={loading}
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          </div>
          <PasswordField id="password" value={password} onChange={setPassword} />
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <button
          type="button"
          className="admin-auth-link"
          onClick={() => {
            setMode("link");
            setError(null);
          }}
        >
          Use a sign-in link instead
        </button>
      </form>
    );
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <p className="admin-auth-sub u-mt-0">
        Enter your email and we will send you a sign-in link. No password needed.
      </p>
      <div className="admin-field">
        <label className="admin-label" htmlFor="email">Email</label>
        <input
          id="email"
          className="admin-input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
          {loading ? "Sending…" : "Send sign-in link"}
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            setMode("password");
            setError(null);
          }}
        >
          Sign in with a password
        </button>
      </div>
    </form>
  );
}
