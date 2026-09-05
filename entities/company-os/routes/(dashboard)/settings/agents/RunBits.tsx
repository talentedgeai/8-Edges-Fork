import type { RoutineRun, RoutineRunStatus } from "@/kernel/audit/routine-runs";
import { formatDate } from "@/kernel/ui/format";

// Small presentational pieces shared by the Agents list and a routine's run
// history: the status badge, a token figure, a duration, and a run timestamp.

const TONE: Record<RoutineRunStatus, string> = { ok: "ok", skipped: "warn", error: "err", running: "info" };
const TEXT: Record<RoutineRunStatus, string> = { ok: "Ran", skipped: "Skipped", error: "Failed", running: "Running" };

export function RunStatusBadge({ status }: { status: RoutineRunStatus | null }) {
  if (!status) return <span className="admin-badge admin-badge--neutral">Never run</span>;
  return <span className={`admin-badge admin-badge--${TONE[status]} admin-badge--dot`}>{TEXT[status]}</span>;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function runWhen(run: RoutineRun | undefined): string {
  return run ? formatDate(run.started_at) : "—";
}
