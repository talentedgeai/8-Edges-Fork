// Thin route: the handler lives in the htt entity (ME-04). The route-segment
// config is declared here rather than re-exported because Next reads it by
// statically analysing this module — a re-exported value is invisible to it and
// the route would silently fall back to the defaults.
// POST is the manual-trigger alias of the same authorized handler; Vercel Cron
// itself invokes the GET.
export { GET, GET as POST } from "@/entities/htt/crons/sync-prs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;
