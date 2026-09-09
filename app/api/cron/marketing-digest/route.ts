// Route file: the body lives in entities/company-os/crons/marketing-digest.ts (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/company-os/crons/marketing-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
