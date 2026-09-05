// The portal entity's front door — the client portal, the proposals index, the
// public survey runner, the contractor work-token pages and the /t ticket
// lookup (docs/engineering/2026-09-03-multi-entity-design.md, ME-09).
//
// Everything another entity is allowed to reach lives behind this file; the
// boundary zones in .eslintrc.entities.json enforce that. What company-os and
// team actually consume today is the client-facing backlog and document
// helpers, the contractor work-request state machine and the company-grain
// token accounting; their old `@/lib/...` shims went with ME-13, and this file
// and `client.ts` are the only ways in.
//
// The browser-safe half sits behind `client.ts` rather than this file on
// purpose: the roadmap editors, the document lists and the hub bands that
// import it are client components, and a client component that reached this
// index would pull the work-request and token modules — and with them the
// service-role Supabase client — into its bundle. The same caveat the retreats
// entity records about its UI exports.
//
// Route bodies (routes/, api/) are deliberately absent: app/ imports those
// files directly, because Next reads a route's segment config from the file in
// app/ and a page is not a library export.

// The client roadmap: backlog items, their priorities and the roadmap groups
// the admin and team screens edit alongside the portal.
export * from "./lib/client-backlog";

// Client documents: the shared program/document store behind the portal's
// Programs tab, the admin company page and the team client hub.
export * from "./lib/client-documents";

// Contractor work requests. The portal owns contractor_work_* (design §4), so
// the state machine both the admin actions and the portal helpers drive lives
// here; each caller supplies its own decider and its own guard.
export * from "./lib/work-requests";
// Contractor work-request notifications (emails to the contractor and the
// client, the ops Lark ping). Portal's since Q2: the requests are portal's
// tables, and team sits above portal in the layer order, so the helpers could
// not stay behind team's door without portal reaching up.
export * from "./lib/contractor-notify";

// Company-grain human-token accounting — the one place the Bought / Delivered /
// Balance / Planned / leverage formula lives, shared with the admin Client Hub.
export * from "./lib/hub-tokens";

// Live AI Program counts per company, for the admin Client Hubs list.
export * from "./lib/program-counts";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
