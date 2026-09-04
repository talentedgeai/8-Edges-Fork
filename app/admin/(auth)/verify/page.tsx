"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

// Interstitial for emailed admin sign-in links (self-serve links from
// lib/admin/signin-link.ts). The email links HERE with ?token_hash=…&type=…
// instead of Supabase's raw one-time verify URL, because corporate email
// scanners prefetch links: a raw link's token is consumed by the scanner's GET
// and the person sees "invalid or expired". Loading this page consumes nothing;
// the token is only redeemed by verifyOtp() when the person presses the button,
// which scanners don't do. Mirror of app/team/(auth)/verify/page.tsx.
//
// Query params are read from window.location in an effect (not useSearchParams)
// so the page needs no Suspense boundary and stays out of the static prerender.

const OTP_TYPES = new Set(["magiclink", "email"]);

export default function AdminVerify() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [otpType, setOtpType] = useState<string>("magiclink");
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    const type = params.get("type") ?? "magiclink";
    if (!hash) {
      router.replace("/admin/login?error=1");
      return;
    }
    setTokenHash(hash);
    setOtpType(OTP_TYPES.has(type) ? type : "magiclink");
  }, [router]);

  async function signIn() {
    if (!tokenHash || state === "working") return;
    setState("working");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.verifyOtp({
      type: otpType as "magiclink" | "email",
      token_hash: tokenHash,
    });
    if (error) {
      setState("failed");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/admin");
  }

  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges
        </div>
        {state === "failed" ? (
          <>
            <p className="admin-auth-sub">
              That link is invalid or has expired. Request a fresh one below.
            </p>
            <div className="admin-form-actions">
              <a className="admin-btn admin-btn--primary" href="/admin/login">
                Go to sign-in
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="admin-auth-sub">
              You&rsquo;re one click away from the Company OS.
            </p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={signIn}
                disabled={!tokenHash || state === "working"}
              >
                {state === "working" ? "Signing you in…" : "Sign in"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
