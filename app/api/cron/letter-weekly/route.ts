// Route file: the body lives in entities/company-os/crons/letter-weekly.ts.
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export.
export { GET } from "@/entities/company-os/crons/letter-weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Opens the draft and runs the first step (a model call) in this request.
export const maxDuration = 300;
