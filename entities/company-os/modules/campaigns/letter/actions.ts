"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { recordRoutineRun } from "@/kernel/audit/routine-runs";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { loadLetter, setAgentState } from "./data";
import { kickLetterStep, LETTER_ROUTINE_ID, runLetterStep } from "./run-step";
import type { AdvanceResult } from "./advance";
import { isLetterStep } from "./steps";
import { startLetterRun } from "./advance";

// The hub's verbs on a letter agent run: start (runs the first step in this
// request so the operator sees movement), retry a stopped step, continue a run
// whose hand-off was dropped, stop. Approval stays the broadcast's own verb.

type Result = { ok: true } | { ok: false; error: string };
const idSchema = z.string().uuid("Not a broadcast id.");

function refresh(id: string): void {
  revalidatePath(`/admin/revenue/marketing/broadcasts/${id}`);
}

export async function startLetter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  if (loaded.data.status !== "draft") return { ok: false, error: "The agent only writes a draft broadcast." };
  if (!loaded.data.brandId) return { ok: false, error: "Set a brand on this broadcast first; the agent reads its voice and posts from the brand." };
  if (isLetterStep(loaded.data.agentStep) && !loaded.data.agentError) return { ok: false, error: "The agent is already running on this broadcast." };

  const started = await startLetterRun(parsed.data);
  if (!started.ok) return started;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "start" } });

  const holder: { result: AdvanceResult } = { result: { skipped: "not run", campaignId: parsed.data } };
  await recordRoutineRun(LETTER_ROUTINE_ID, async () => {
    holder.result = await runLetterStep(parsed.data);
    return Response.json(holder.result);
  });
  refresh(parsed.data);
  if ("skipped" in holder.result) return { ok: false, error: holder.result.skipped };
  if (!holder.result.ok) return { ok: false, error: holder.result.error };
  return { ok: true };
}

export async function retryLetterStep(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isLetterStep(loaded.data.agentStep)) return { ok: false, error: "There is no step to retry." };
  const cleared = await setAgentState(parsed.data, { step: loaded.data.agentStep, error: null });
  if (!cleared.ok) return cleared;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "retry", step: loaded.data.agentStep } });
  await kickLetterStep(parsed.data);
  refresh(parsed.data);
  return { ok: true };
}

export async function continueLetter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isLetterStep(loaded.data.agentStep)) return { ok: false, error: "There is no run to continue." };
  if (loaded.data.agentError) return { ok: false, error: "The run stopped with an error; use Retry step." };
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "continue", step: loaded.data.agentStep } });
  await kickLetterStep(parsed.data);
  return { ok: true };
}

export async function stopLetter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const stopped = await setAgentState(parsed.data, { step: null, error: null });
  if (!stopped.ok) return stopped;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "stop" } });
  refresh(parsed.data);
  return { ok: true };
}
