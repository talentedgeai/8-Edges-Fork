// The retreats entity's front door — the Vietnam experience, my-retreat, the
// reserve and events pages, the private-session booking and the trip/passport
// forms (docs/engineering/2026-09-03-multi-entity-design.md, ME-06).
//
// Everything another entity or app/ is allowed to reach lives behind this file;
// the boundary zones in .eslintrc.entities.json enforce that. The old
// `@/lib/events`, `@/components/experience/*` … shims went with ME-13; this
// file and `client.ts` are the only ways in.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// Domain
export * from "./events";
export * from "./events-server";
export * from "./private-session";
export * from "./private-session-blocks";
export * from "./my-retreat/access";
export * from "./my-retreat/content";

// Person media and tickets, shared with company-os and team screens
export * from "./avatars";
export * from "./id-documents";
export * from "./qr";

// UI. These carry "use client"; a server module may re-export them, but a
// client component importing this index would pull the server modules above
// into its bundle, which is why client code takes them from `client.ts`.
export * from "./ui/PrivateSessionReserve";
export * from "./ui/experience/ExperienceSlider";
export * from "./ui/experience/PhotoSlider";
export * from "./ui/experience/PlaceholderImage";
export * from "./ui/experience/Subpage";
export * from "./ui/gallery/PhotoTagPicker";
export * from "./ui/retreat/RetreatAgenda";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
