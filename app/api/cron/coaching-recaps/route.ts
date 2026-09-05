// Route file: the body lives in entities/team/crons/coaching-recaps.ts (ME-11).
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/team/crons/coaching-recaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
