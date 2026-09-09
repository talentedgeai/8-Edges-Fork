import { z } from "zod";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { runWriterStep, WRITER_ROUTINE_ID } from "@/entities/company-os/modules/campaigns/writer/run-step";

// The writer agent's step route. Not a scheduled cron: it runs one step of one
// campaign's writer run and is called by the app itself, once per step, as a
// run hands itself on (see modules/campaigns/writer/run-step.ts). It sits
// under /api/cron/ because withRoutineRun gates it with the same bearer as a
// cron and records each step as a routine run, so Settings -> Agents lists it
// beside them with its tokens.

const bodySchema = z.object({ campaignId: z.string().uuid() });

async function handler(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Body must be { campaignId: uuid }." }, { status: 400 });
  return Response.json(await runWriterStep(parsed.data.campaignId));
}

export const POST = (req: Request): Promise<Response> => withRoutineRun(WRITER_ROUTINE_ID, req, handler);
