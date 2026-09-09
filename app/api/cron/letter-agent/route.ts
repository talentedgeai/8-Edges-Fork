// Route file: the body lives in entities/company-os/crons/letter-agent.ts.
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export. On demand, not
// scheduled: the letter agent run calls this once per step as it hands itself on.
export { POST } from "@/entities/company-os/crons/letter-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// A single step (the write pass on the frontier model) can take minutes.
export const maxDuration = 300;
