// Route file: the body lives in entities/retreats/routes/events/[slug]/page.tsx (ME-06).
// The names are listed one by one rather than `export *` because Next reads a
// route file's export names statically: the metadata-route loader turns a star
// re-export into `export { , runtime }`, which does not parse.
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { default, generateMetadata } from "@/entities/retreats/routes/events/[slug]/page";
export const dynamic = "force-dynamic";
