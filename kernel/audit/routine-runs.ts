import { AsyncLocalStorage } from "node:async_hooks";
import { companyOs } from "@/kernel/data/supabase";

// Run log for scheduled routines. Every Vercel cron wraps its handler in
// withRoutineRun, which opens a company_os.routine_runs row, runs the handler,
// and closes the row with the outcome, the handler's JSON body and the AI
// tokens spent while it ran. Token attribution rides on AsyncLocalStorage:
// kernel/ai/response.ts reports every model call's usage into whichever run is
// active on the current async chain, so no handler has to thread a run id
// through its code. The kernel owns the table; the Settings -> Agents page
// reads it through the list helpers below. Recording is best-effort: a failed
// insert or update is logged and never changes what the routine returns.

/**
 * The usage shape both `messages.create` and a stream's final message carry.
 * It lives here rather than in kernel/ai/response.ts because it describes what
 * a run records; keeping it there made the two modules import each other.
 */
export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export type RoutineHost = "vercel" | "mac-mini";
export type RoutineRunStatus = "running" | "ok" | "skipped" | "error";

export type RoutineRun = {
  id: string;
  routine_id: string;
  host: RoutineHost;
  status: RoutineRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  summary: string | null;
  result: unknown;
  error: string | null;
  log: string | null;
  ai_calls: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cache_read_tokens: number;
  ai_cache_write_tokens: number;
};

type RunContext = {
  aiCalls: number;
  aiInput: number;
  aiOutput: number;
  aiCacheRead: number;
  aiCacheWrite: number;
};

const storage = new AsyncLocalStorage<RunContext>();

/** Called by kernel/ai/response.ts for every model call; a no-op outside a run. */
export function recordAiUsage(usage: AiUsage | null | undefined): void {
  const ctx = storage.getStore();
  if (!ctx || !usage) return;
  ctx.aiCalls += 1;
  ctx.aiInput += usage.input_tokens ?? 0;
  ctx.aiOutput += usage.output_tokens ?? 0;
  ctx.aiCacheRead += usage.cache_read_input_tokens ?? 0;
  ctx.aiCacheWrite += usage.cache_creation_input_tokens ?? 0;
}

// A one-line summary from the handler's JSON: its scalar counters, in order.
// "dueForReview 2, emailsSent 2" says more at a glance than the raw body.
export function summarizeResult(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v === "number" || typeof v === "boolean") parts.push(`${k} ${v}`);
    else if (typeof v === "string" && v.length <= 80 && k !== "error") parts.push(`${k} ${v}`);
    if (parts.length >= 6) break;
  }
  return parts.length ? parts.join(", ") : null;
}

function statusFor(response: Response, body: unknown): RoutineRunStatus {
  if (!response.ok) return "error";
  const b = body as Record<string, unknown> | null;
  if (b && typeof b === "object" && ("skipped" in b || b.ok === false)) return "skipped";
  return "ok";
}

/**
 * Wrap a cron handler: check the Vercel Cron bearer, then record the run. The
 * 401 an unauthorised probe gets is not a run and is not recorded; everything
 * else is. Pass the cron path from vercel.json as the routine id so the Agents
 * page can join runs to schedules.
 */
export async function withRoutineRun(
  routineId: string,
  req: Request,
  handler: (req: Request) => Promise<Response>,
  host: RoutineHost = "vercel",
): Promise<Response> {
  // The bearer gate for every wrapped entry point. Vercel Cron sends
  // Authorization: Bearer $CRON_SECRET; anything else is not a run and is not
  // recorded. It lives here rather than in each handler because every handler
  // carried a byte-identical copy of it, and a copy is how one of them ends up
  // missing the check.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx: RunContext = { aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0 };
  const startedAt = new Date();

  return storage.run(ctx, async () => {
    let response: Response;
    let failure: string | null = null;
    try {
      response = await handler(req);
    } catch (err) {
      // Next signals "this route cannot be prerendered" by throwing while it
      // probes the handler at build time. That is not a run: let it through,
      // or the build records a phantom error and may freeze the probe's
      // response as the route's static output.
      if ((err as { digest?: string })?.digest === "DYNAMIC_SERVER_USAGE") throw err;
      failure = err instanceof Error ? (err.stack ?? err.message) : String(err);
      response = Response.json({ error: failure.split("\n")[0] }, { status: 500 });
    }
    if (response.status === 401) return response;

    // Read the body off a clone so the caller's response stream is untouched.
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    const finishedAt = new Date();
    const row = {
      routine_id: routineId,
      host,
      status: failure ? ("error" as const) : statusFor(response, body),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      summary: failure ? failure.split("\n")[0] : summarizeResult(body),
      result: body as never,
      error: failure ?? ((body as Record<string, unknown> | null)?.error as string | undefined) ?? null,
      log: null,
      ai_calls: ctx.aiCalls,
      ai_input_tokens: ctx.aiInput,
      ai_output_tokens: ctx.aiOutput,
      ai_cache_read_tokens: ctx.aiCacheRead,
      ai_cache_write_tokens: ctx.aiCacheWrite,
    };
    const { data, error } = await companyOs.from("routine_runs").insert(row).select("id").single();
    if (error) console.error(`[routine-runs] ${routineId}: ${error.message}`);
    else console.log(`[routine-runs] ${routineId}: ${row.status} run ${data.id}`);
    return response;
  });
}

/** Latest run per routine, for the Agents list. */
export async function latestRunsByRoutine(): Promise<Map<string, RoutineRun>> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`routine_runs: ${error.message}`);
  const latest = new Map<string, RoutineRun>();
  for (const r of (data ?? []) as RoutineRun[]) if (!latest.has(r.routine_id)) latest.set(r.routine_id, r);
  return latest;
}

/** AI tokens spent per routine over the trailing window (days). */
export async function aiTokensByRoutine(days: number): Promise<Map<string, { calls: number; input: number; output: number }>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("routine_id, ai_calls, ai_input_tokens, ai_output_tokens")
    .gte("started_at", since)
    .limit(5000);
  if (error) throw new Error(`routine_runs: ${error.message}`);
  const out = new Map<string, { calls: number; input: number; output: number }>();
  for (const r of data ?? []) {
    const t = out.get(r.routine_id) ?? { calls: 0, input: 0, output: 0 };
    t.calls += r.ai_calls;
    t.input += Number(r.ai_input_tokens);
    t.output += Number(r.ai_output_tokens);
    out.set(r.routine_id, t);
  }
  return out;
}

export async function listRoutineRuns(routineId: string, limit = 100): Promise<RoutineRun[]> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("*")
    .eq("routine_id", routineId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`routine_runs: ${error.message}`);
  return (data ?? []) as RoutineRun[];
}
