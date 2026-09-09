// Route file: the body lives in entities/company-os/crons/qbo-invoice-sync.ts (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/company-os/crons/qbo-invoice-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
