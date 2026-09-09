// Thin route: the handlers live in the assistant entity (ME-08). The
// route-segment config is declared here rather than re-exported because Next
// reads it by statically analysing this module — a re-exported value is
// invisible to it and the route would silently fall back to the defaults.
export { GET, PATCH } from "@/entities/assistant/api/[surface]/conversations/[id]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
