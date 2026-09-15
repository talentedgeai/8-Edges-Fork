import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { loadAgentManagement } from "@/entities/company-os";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "45 20 * * *";

// Vercel cron (see vercel.json): nightly. Refreshes the key results whose
// number the company's own systems can read off, so a KR marked source=agent
// never depends on someone remembering to check it in. Each entry names the KR
// row it keeps and how its value is computed; the run writes current_value and
// appends a kr_logs row for the week, the same trail a human check-in leaves.
const AGENT = "devops-agent";

const COMPUTED_KRS: { id: string; label: string; compute: () => Promise<{ value: number; note: string }> }[] = [
  {
    // O4 · "Build 88 workflows into the 8 Edges Open Source System by Dec 31".
    id: "bf0cf73e-8322-4c12-a6fb-5006331f0b30",
    label: "workflows built",
    // The number is exactly what Settings -> Agents lists: every managed
    // routine across Vercel crons, on-demand routines and Mac mini jobs.
    compute: async () => {
      const view = loadAgentManagement();
      const crons = view.vercel.filter((r) => r.cron).length;
      const onDemand = view.vercel.length - crons;
      return {
        value: view.routines.length,
        note: `${view.routines.length} managed routines on Settings → Agents: ${crons} Vercel crons, ${onDemand} on-demand routines, ${view.macMini.length} Mac mini jobs.`,
      };
    },
  },
];

// Monday of the week containing `d`, as the YYYY-MM-DD kr_logs.week_start wants.
function weekStart(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

async function handler(_req: Request) {
  const now = new Date();
  const results: { id: string; label: string; value?: number; previous?: number | null; error?: string }[] = [];

  for (const kr of COMPUTED_KRS) {
    const { data: row, error: readError } = await companyOs
      .from("key_results")
      .select("id, current_value")
      .eq("id", kr.id)
      .maybeSingle();
    if (readError) {
      results.push({ id: kr.id, label: kr.label, error: readError.message });
      continue;
    }
    if (!row) {
      // The KR was deleted or replaced; nothing to keep, but say so rather than
      // silently doing nothing forever.
      results.push({ id: kr.id, label: kr.label, error: "key result not found" });
      continue;
    }

    const { value, note } = await kr.compute();
    const { error: writeError } = await companyOs
      .from("key_results")
      .update({ current_value: value, updated_at: now.toISOString() })
      .eq("id", kr.id);
    if (writeError) {
      results.push({ id: kr.id, label: kr.label, error: writeError.message });
      continue;
    }
    const { error: logError } = await companyOs.from("kr_logs").insert({
      key_result_id: kr.id,
      week_start: weekStart(now),
      value,
      note_md: note,
      author_kind: "agent",
      author_agent: AGENT,
    });
    if (logError) {
      results.push({ id: kr.id, label: kr.label, value, previous: row.current_value, error: `log: ${logError.message}` });
      continue;
    }
    results.push({ id: kr.id, label: kr.label, value, previous: row.current_value });
  }

  const failed = results.filter((r) => r.error).length;
  return NextResponse.json({ updated: results.length - failed, failed, results }, { status: failed ? 500 : 200 });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/kr-agent-sync/", req, handler);
