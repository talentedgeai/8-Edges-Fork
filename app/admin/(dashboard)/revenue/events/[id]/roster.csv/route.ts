// Route file: the body lives in entities/company-os/routes/(dashboard)/revenue/events/[id]/roster.csv/route.ts (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/company-os/routes/(dashboard)/revenue/events/[id]/roster.csv/route";

export const dynamic = "force-dynamic";
