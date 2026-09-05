// Route file: the body lives in entities/company-os/api/admin/marketing/publish-editor/route.ts (ME-12).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { POST } from "@/entities/company-os/api/admin/marketing/publish-editor/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
