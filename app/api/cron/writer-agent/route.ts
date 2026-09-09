// Route file: the body lives in entities/company-os/crons/writer-agent.ts.
// Segment config stays here: Next reads it from the route file's own
// `export const` declarations and never through a re-export. On demand, not
// scheduled: the writer run calls this once per step as it hands itself on.
export { POST } from "@/entities/company-os/crons/writer-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// A single step (an edit pass on Fable) can take four minutes.
export const maxDuration = 300;
