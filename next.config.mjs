/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  eslint: {
    // `next lint` defaults to app/, pages/, components/, lib/ and src/ only, so
    // the kernel (ME-03) and the entity blocks (ME-04 onwards) were linted by
    // nothing once code moved there — including the `import/no-restricted-paths`
    // boundary zones generated from entities.manifest.json, whose whole job is
    // to police those two directories. Naming the roots explicitly restores the
    // coverage for `npm run lint`, `next build`, and the lint-warning ratchet
    // (which shells out to `next lint` itself). lib/ and components/ are gone
    // since ME-13; app/ is the composition root and the code is in the other two.
    dirs: ["app", "kernel", "entities"],
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Next keeps an in-memory Client Router Cache of RSC payloads per tab, and
    // re-uses a dynamic segment's payload for 30 seconds by default. That
    // default outranks `dynamic = "force-dynamic"`, which the 282 authenticated
    // pages carry: force-dynamic promises the server re-renders WHEN ASKED, and
    // for those 30 seconds the browser does not ask. Measured on a production
    // build for card 4b13dd13 — a navigation away and straight back re-used a
    // payload that was 21 seconds old and missing a row that already existed.
    //
    // Zero means every soft navigation re-fetches. That is the right trade here
    // because this is an internal operations app whose pages are already
    // uncacheable by their own route config; a client reading a figure a manager
    // acts on must not be shown a figure from half a minute ago.
    //
    // This does NOT cover back/forward, which restores from the cache no matter
    // how stale (verified at 38 seconds). kernel/shell/RefreshOnStale.tsx is the
    // other half of the fix and explains the rest.
    staleTimes: { dynamic: 0 },
    // instrumentation.ts is where the composition root registers the event-bus
    // subscribers (app/events.ts, generated from deployments/*.json). Next 14
    // only runs that file behind this flag — off, `register()` is never called,
    // nothing subscribes, and every soft effect on the bus (a done card marking
    // its coaching commitment kept) silently stops. scripts/check-deployment
    // .test.mjs pins this line for that reason.
    instrumentationHook: true,
    // resvg ships a native binary per platform behind a `require` webpack cannot
    // follow. Left to the bundler, the exhibit renderer fails at runtime with a
    // missing .node file; as an external it loads from node_modules as intended.
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
    // Resume uploads (recruiter intake, careers apply) arrive through server
    // actions; the framework default of 1 MB silently rejected files the app
    // itself allows up to 10 MB.
    serverActions: { bodySizeLimit: "10mb" },
    // The dynamic [slug] OG image routes render at request time, and Vercel's
    // file tracing does not bundle public/ into those lambdas, so the Manrope
    // TTFs (and case-study photos) 500'd with ENOENT. Statically prerendered
    // OG routes never hit this because they render at build time.
    outputFileTracingIncludes: {
      "/post/[slug]/opengraph-image": ["./public/fonts/manrope-og-*.ttf"],
      "/case-studies/[slug]/opengraph-image": [
        "./public/fonts/manrope-og-*.ttf",
        "./public/case studies/images/**/*",
      ],
      // The writer agent's exhibits step rasterises SVG with resvg using the
      // Manrope TTFs; the step route is a lambda of its own and needs them traced.
      "/api/cron/writer-agent": ["./public/fonts/manrope-og-*.ttf"],
    },
  },
  async rewrites() {
    return [
      // The new-member onboarding form is a purpose-driven survey; serve it at a
      // clean top-level URL while it runs on the survey engine underneath.
      { source: '/new-member-onboarding', destination: '/surveys/new-member-onboarding' },
      // Video scripts are a static folder in public/; Next does not serve a
      // directory's index.html on its own, so map the clean URL to it.
      { source: '/video-scripts', destination: '/video-scripts/index.html' },
      { source: '/ai-officer/video-scripts', destination: '/ai-officer/video-scripts/index.html' },
    ]
  },
  async redirects() {
    return [
      // The 100-human-hours post was retitled to lead with the outcome; the old
      // slug was already shared, so keep those links working.
      { source: '/post/100-human-hours-one-whole-product', destination: '/post/imagine-knowing-everything-about-your-company', permanent: true },
      // My Tasks was renamed to Work Boards.
      { source: '/team/my-tasks', destination: '/team/workboard', permanent: true },
      { source: '/team/my-work-boards', destination: '/team/workboard', permanent: true },
      // The talent Rank page was renamed to Candidate Pool.
      { source: '/admin/talent/rank', destination: '/admin/talent/candidate-pool', permanent: true },
      // OKRs were renamed to Company Goals (FAST Goals stay the individual layer).
      { source: '/team/okrs', destination: '/team/company-goals', permanent: true },
    ]
  },
}

export default nextConfig
