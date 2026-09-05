// Route file: the body lives in entities/company-os/api/qbo/connect/route.ts (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/company-os/api/qbo/connect/route";

export const dynamic = "force-dynamic";
