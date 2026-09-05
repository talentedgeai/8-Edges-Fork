export { POST } from "@/entities/site/api/unsubscribe/route";

// Next reads route-segment config by static analysis of the file in app/, so it
// stays on the mount; a re-export would be invisible to it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
