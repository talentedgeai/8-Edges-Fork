// Thin route: the handler lives in the assistant entity (ME-08). The
// route-segment config is declared here rather than re-exported because Next
// reads it by statically analysing this module — a re-exported value is
// invisible to it and the route would silently fall back to the defaults.
export { GET } from "@/entities/assistant/api/[surface]/conversations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next 14 freezes fetch (and thus supabase-js reads) in route handlers even under
// force-dynamic; this keeps the list fresh per request.
export const fetchCache = "force-no-store";
