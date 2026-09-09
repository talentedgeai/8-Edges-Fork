import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next/headers` only works inside a request scope, so the test substitutes
// a controllable header bag. Each case sets the headers it needs; the rest
// of the function (env fallback, vercel.app exclusion, proto inference) is
// exercised through the public export only.
const headerBag = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: () => ({ get: (name: string) => headerBag.get(name) ?? null }),
}));

import { getSiteOrigin } from "@/kernel/config/site-origin";

describe("getSiteOrigin", () => {
  const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    headerBag.clear();
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
  });

  it("builds the origin from the request host and forwarded proto", () => {
    headerBag.set("host", "edge8.ai");
    headerBag.set("x-forwarded-proto", "https");
    expect(getSiteOrigin()).toBe("https://edge8.ai");
  });

  it("infers http for localhost when no proto header is present", () => {
    headerBag.set("host", "localhost:3000");
    expect(getSiteOrigin()).toBe("http://localhost:3000");
  });

  it("infers https for a non-localhost host when no proto header is present", () => {
    headerBag.set("host", "www.edge8.ai");
    expect(getSiteOrigin()).toBe("https://www.edge8.ai");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when there is no host header", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    expect(getSiteOrigin()).toBe("https://preview.example.com");
  });

  it("falls back to the production domain when neither host nor env is set", () => {
    expect(getSiteOrigin()).toBe("https://www.edge8.ai");
  });

  it("treats a *.vercel.app host as the no-request case", () => {
    headerBag.set("host", "edge8-web-abc123.vercel.app");
    headerBag.set("x-forwarded-proto", "https");
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.edge8.ai";
    expect(getSiteOrigin()).toBe("https://www.edge8.ai");
  });

  it("ignores an empty NEXT_PUBLIC_SITE_URL and uses the production domain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(getSiteOrigin()).toBe("https://www.edge8.ai");
  });
});
