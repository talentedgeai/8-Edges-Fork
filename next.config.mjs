/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
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
      // The private workflows library moved out of public/ so that Next stops
      // serving those 76 internal documents to anyone with a URL. They are now
      // read from disk by the gated catch-all route, and nothing outside
      // public/ is bundled into a lambda unless it is traced explicitly.
      // Keys are matched as globs (picomatch), and a literal "[...path]" is read
      // as a character class that never matches the route it names — verified
      // by the route's .nft.json listing zero private-docs files. Match the
      // catch-all by prefix instead; e8/[slug] below keeps its narrower set.
      "/workflows/private/**": ["./private-docs/**/*"],
      // The e8/[slug] handler reads the same folder; each route is its own
      // function on Vercel, so it needs its own include or those documents 404.
      "/workflows/private/e8/[slug]": ["./private-docs/workflows/private/e8/**/*"],
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
    ]
  },
  async redirects() {
    return [
      // The 100-human-hours post was retitled to lead with the outcome; the old
      // slug was already shared, so keep those links working.
      { source: '/post/100-human-hours-one-whole-product', destination: '/post/imagine-knowing-everything-about-your-company', permanent: true },
      // My Tasks was renamed to Work Boards.
      { source: '/team/my-tasks', destination: '/team/my-work-boards', permanent: true },
      // The talent Rank page was renamed to Candidate Pool.
      { source: '/admin/talent/rank', destination: '/admin/talent/candidate-pool', permanent: true },
      // OKRs were renamed to Company Goals (FAST Goals stay the individual layer).
      { source: '/team/okrs', destination: '/team/company-goals', permanent: true },
      // The AI Resume Screen workflow was folded into the end-to-end Recruitment workflow.
      { source: '/workflows/ai-resume-screen', destination: '/workflows/recruitment', permanent: true },
      // Sales Call Intelligence was superseded by the scheduled-agent version of the same pipeline.
      { source: '/workflows/sales-call-intelligence', destination: '/workflows/lark-scheduler-to-crm-updates', permanent: true },
      // The onboarding deck moved into the private workflows library, now under the E8 brand.
      { source: '/blueprints/team-onboarding', destination: '/workflows/private/e8/team-onboarding', permanent: true },
      // The private workflows library was split into E8 and AIO Labs brands; the
      // existing guides moved under /workflows/private/e8/. Keep shared links working.
      { source: '/workflows/private/team-onboarding', destination: '/workflows/private/e8/team-onboarding', permanent: true },
      { source: '/workflows/private/private-retreats', destination: '/workflows/private/e8/private-retreats', permanent: true },
      { source: '/workflows/private/accounting-training', destination: '/workflows/private/e8/accounting-training', permanent: true },
      { source: '/workflows/private/ai-retreat-work-healthy', destination: '/workflows/private/e8/ai-retreat-work-healthy', permanent: true },
      { source: '/workflows/private/ai-retreat-austpayroll', destination: '/workflows/private/e8/ai-retreat-austpayroll', permanent: true },
      { source: '/workflows/private/vung-tau-leg.html', destination: '/workflows/private/e8/vung-tau-leg.html', permanent: true },
      // The "AIO Labs" brand was renamed to "AI Officer Institute"; the route dir moved
      // from /workflows/private/aio-labs to /workflows/private/ai-officer-institute.
      { source: '/workflows/private/aio-labs', destination: '/workflows/private/ai-officer-institute', permanent: true },
      { source: '/workflows/private/aio-labs/ui-redesign-plan', destination: '/workflows/private/ai-officer-institute/ui-redesign-plan', permanent: true },
      { source: '/workflows/private/aio-labs/agentic-ai-workflows.html', destination: '/workflows/private/ai-officer-institute/agentic-ai-workflows.html', permanent: true },
      { source: '/workflows/private/aio-labs/gen-ai-workflows.html', destination: '/workflows/private/ai-officer-institute/gen-ai-workflows.html', permanent: true },
      { source: '/workflows/private/aio-labs/aio-company-admin-workflow.html', destination: '/workflows/private/ai-officer-institute/aio-company-admin-workflow.html', permanent: true },
      { source: '/workflows/private/aio-labs/aio-platform-admin-workflow.html', destination: '/workflows/private/ai-officer-institute/aio-platform-admin-workflow.html', permanent: true },
    ]
  },
}

export default nextConfig
