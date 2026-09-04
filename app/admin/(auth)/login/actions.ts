"use server";

import { sendAdminSelfServeSignInLink } from "@/lib/admin/signin-link";

// Unauthenticated by design (this IS the login page). The action gates on the
// admin allowlist server-side and reveals nothing about whether an account
// exists. See lib/admin/signin-link.ts for why this replaces a browser-side
// signInWithOtp() flow: raw Supabase links get consumed by corporate email
// scanners before the person clicks.

export async function requestSignInLink(email: string): Promise<void> {
  await sendAdminSelfServeSignInLink(email);
}
