"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { PasswordField } from "@/components/admin/PasswordField";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { requestSignInLink } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // `?redirect=` is attacker-controllable; only follow it onto our own surfaces.
  const redirectTo = safeInternalPath(params.get("redirect"), "/admin");
  const [mode, setMode] = useState<"signin" | "reset" | "link">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That sign-in link was invalid or expired. Please sign in again." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Full navigation so the middleware + server layout re-run with the new cookie.
    router.replace(redirectTo);
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/admin/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(`If an account exists for ${email.trim().toLowerCase()}, a password reset link is on its way.`);
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await requestSignInLink(email);
    } catch {
      setError("Something went wrong sending your link. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    // Neutral response regardless of whether an account exists.
    setNotice(`If an account exists for ${email.trim().toLowerCase()}, a sign-in link is on its way. Check your email and press the button in it to sign in.`);
  }

  if (mode === "link") {
    return (
      <form className="admin-form" onSubmit={handleLink}>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}
        <p className="admin-auth-sub u-mt-0">
          Enter your email and we will send you a sign-in link. No password needed.
        </p>
        <div className="admin-field">
          <label className="admin-label" htmlFor="link-email">Email</label>
          <input
            id="link-email"
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
        </div>
        <button
          type="button"
          className="admin-auth-link"
          onClick={() => {
            setMode("signin");
            setError(null);
            setNotice(null);
          }}
        >
          ← Back to password sign in
        </button>
      </form>
    );
  }

  if (mode === "reset") {
    return (
      <form className="admin-form" onSubmit={handleReset}>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}
        <p className="admin-auth-sub u-mt-0">
          Enter your email and we will send a link to reset your password.
        </p>
        <div className="admin-field">
          <label className="admin-label" htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
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
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </div>
        <button
          type="button"
          className="admin-auth-link"
          onClick={() => {
            setMode("signin");
            setError(null);
            setNotice(null);
          }}
        >
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form className="admin-form" onSubmit={handleSignIn}>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}
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
            onClick={() => {
              setMode("reset");
              setError(null);
              setNotice(null);
            }}
          >
            Forgot password?
          </button>
        </div>
        <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            setMode("link");
            setError(null);
            setNotice(null);
          }}
        >
          Email me a sign-in link
        </button>
      </div>
    </form>
  );
}
