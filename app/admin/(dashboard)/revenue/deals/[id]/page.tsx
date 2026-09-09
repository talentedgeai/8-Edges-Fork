// Route file: the body lives in entities/company-os/routes/(dashboard)/revenue/deals/[id]/page.tsx (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { default, generateMetadata } from "@/entities/company-os/routes/(dashboard)/revenue/deals/[id]/page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
