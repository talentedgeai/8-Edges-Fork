// The library entity's public surface — the workflow index, the private
// library's hand-built item lists, the published-document helpers and the
// sanitiser schema a rendered HTML document is run through
// (docs/engineering/2026-09-03-multi-entity-design.md, ME-10).
//
// Design §3 rule 2: another entity, and app/, may reach the library only
// through this file. What is behind it is what someone outside actually reads
// today — the public site lists the workflows in the sitemap and llms.txt, and
// the site's /api/stats and the admin Marketing overview take the year-goal
// numbers (lib/stats, moved here from the site by Q2 so the site's door graph
// does not reach a same-layer entity). The sanitiser schema a rendered post is
// run through is kernel/config/post-html-schema, shared with the site.
//
// Route bodies (routes/, api/) are deliberately absent: app/ imports those
// files directly, because Next reads a route's segment config from the file
// under app/ and a page is not a library export. `tables.ts` is absent for the
// same reason it is in htt — the ownership gate reads it, nobody else does.
//
// `./lib/docs` reaches Supabase Storage with the service-role client and
// `./lib/private-docs` reads the filesystem, so a client component that
// imported this index would pull both into its bundle. A client component
// enters through `client.ts`, the browser-safe door, never this file.
export * from "./lib/workflowsData";
export * from "./lib/privateLibraryData";
export * from "./lib/docs";
export * from "./lib/stats";
