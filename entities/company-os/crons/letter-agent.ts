import { z } from "zod";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { LETTER_ROUTINE_ID, runLetterStep } from "@/entities/company-os/modules/campaigns/letter/run-step";

// The letter agent's step route. Not scheduled: it runs one step of one
// broadcast's run and is called by the app itself, once per step, as a run
// hands itself on (see modules/campaigns/letter/run-step.ts). It sits under
// /api/cron/ because withRoutineRun gates it with the cron bearer and records
// each step as a routine run, so Settings -> Agents lists it with its tokens.

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
  return Response.json(await runLetterStep(parsed.data.campaignId));
}

export const POST = (req: Request): Promise<Response> => withRoutineRun(LETTER_ROUTINE_ID, req, handler);
