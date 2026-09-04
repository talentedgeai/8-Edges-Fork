import { headers } from "next/headers";

// Server-only. Resolves the current request's origin (matches the checkout
// route's `new URL(request.url).origin` derivation) for building absolute
// URLs — signup/feedback QR links, ticket links, etc. Falls back to the
// production domain for contexts with no request (local scripts, cron).
// Vercel cron and deploy-hook requests arrive on the deployment's generated
// *.vercel.app host (which sits behind deployment protection), so that host
// must never leak into user-facing links; treat it like the no-request case.
// NEVER import from a client component.
export function getSiteOrigin(): string {
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  if (host && !host.endsWith(".vercel.app")) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.edge8.ai";
}
