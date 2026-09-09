// Where each brand's blog actually lives. The marketing DB (company_os.
// marketing_calendar) is one shared source across brands, but each brand renders
// on its OWN website, so publishing must resolve a per-brand destination — never
// assume edge8.ai. This map is the single source of truth for that routing.
//
// - self: this repo (edge8-web) renders this brand's posts. Only the self brand's
//   posts may appear on this site; everything else is filtered out of the reader.
// - blogEnabled: the brand's site has a live blog that reads these posts. When
//   false (e.g. AI Officer Institute until aio-website ships a blog), publishing
//   is refused with a clear message rather than sending content to a dead URL.

import { SELF_BRAND_SLUG } from "@/kernel/config/brand";

export type BrandSite = {
  slug: string;
  domain: string; // origin, no trailing slash
  self: boolean;
  blogEnabled: boolean;
};

const SITES: Record<string, BrandSite> = {
  "arca-wellness": { slug: "arca-wellness", domain: "https://arca-wellness.vercel.app", self: true, blogEnabled: true },
};

export function siteForBrandSlug(slug: string | null): BrandSite | null {
  if (!slug) return null;
  return SITES[slug] ?? null;
}

// Human-readable reason a brand cannot be published from here, or null if it can.
export function blogPublishBlocker(slug: string | null, brandName: string): string | null {
  const site = siteForBrandSlug(slug);
  if (!site) {
    return `${brandName} has no website configured for blog publishing.`;
  }
  if (!site.blogEnabled) {
    return `${brandName} publishes to ${site.domain}, but that site has no blog yet. Blog publishing for this brand is not available.`;
  }
  return null;
}
