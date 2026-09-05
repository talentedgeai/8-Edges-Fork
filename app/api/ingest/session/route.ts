export { POST } from "@/entities/site/api/ingest/session/route";

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Each entry fans out into sequential edge-function calls, so a batch's wall
// time scales with batch size. Raised so a full 25-entry batch always fits.
export const maxDuration = 300;
