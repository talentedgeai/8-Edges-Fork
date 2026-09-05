import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { requireSuperAdmin } from "@/kernel/identity/admin-auth";
import { latestRunsByRoutine, aiTokensByRoutine } from "@/kernel/audit/routine-runs";
import { loadAgentManagement, type Routine } from "@/entities/company-os/lib/agent-management";
import { RunStatusBadge, tokens, runWhen } from "./RunBits";

// Settings → Agents. Every routine Edge8 runs, on Vercel and on the office Mac
// mini, with the evidence of its last run beside its definition: when it last
// ran, how it ended, what it reported, and the AI tokens it spent over the
// last 30 days. A routine that has never written a run shows "Never run"
// rather than disappearing, so a silent cron is visible. Click a row for the
// run history.

const TOKEN_WINDOW_DAYS = 30;

function HostBadge({ host }: { host: Routine["host"] }) {
  return host === "vercel" ? (
    <span className="admin-badge admin-badge--info admin-badge--dot">Vercel</span>
  ) : (
    <span className="admin-badge admin-badge--ok admin-badge--dot">Mac mini</span>
  );
}

export default async function AgentsPage() {
  await requireSuperAdmin();
  const { routines } = loadAgentManagement();
  const [latest, spend] = await Promise.all([latestRunsByRoutine(), aiTokensByRoutine(TOKEN_WINDOW_DAYS)]);

  const ran = routines.filter((r) => latest.get(r.id)?.status === "ok").length;
  const skipped = routines.filter((r) => latest.get(r.id)?.status === "skipped").length;
  const failed = routines.filter((r) => latest.get(r.id)?.status === "error").length;
  const never = routines.filter((r) => !latest.has(r.id)).length;
  const totalTokens = [...spend.values()].reduce((n, t) => n + t.input + t.output, 0);

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Agents"
        sub={`${routines.length} routines on Vercel and the Mac mini. Open one to see its run history.`}
      />

      <div className="admin-kpi-grid admin-kpi-grid--2up u-mb-5">
        <div className="admin-kpi">
          <div className="admin-kpi-label">Last run OK</div>
          <div className="admin-kpi-val">{ran}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Last run skipped</div>
          <div className={`admin-kpi-val ${skipped > 0 ? "u-warn" : ""}`}>{skipped}</div>
          <div className="admin-kpi-note">Missing config or nothing due</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Failing</div>
          <div className={`admin-kpi-val ${failed > 0 ? "u-err" : "u-ok"}`}>{failed}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Never run</div>
          <div className={`admin-kpi-val ${never > 0 ? "u-warn" : ""}`}>{never}</div>
          <div className="admin-kpi-note">No run recorded yet</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">AI tokens, {TOKEN_WINDOW_DAYS}d</div>
          <div className="admin-kpi-val">{tokens(totalTokens)}</div>
          <div className="admin-kpi-note">Input + output across all routines</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-th--lg">Routine</th>
                <th>Host</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Outcome</th>
                <th>What it reported</th>
                <th className="u-right">AI tokens, {TOKEN_WINDOW_DAYS}d</th>
              </tr>
            </thead>
            <tbody>
              {routines.map((r) => {
                const run = latest.get(r.id);
                const t = spend.get(r.id);
                const href = `/admin/settings/agents/${encodeURIComponent(r.id)}`;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={href} className="u-strong u-ink">
                        {r.name}
                      </Link>
                      <div className="admin-cell-muted u-mt-1 u-max-sm">{r.description}</div>
                    </td>
                    <td>
                      <HostBadge host={r.host} />
                    </td>
                    <td className="u-nowrap">{r.schedule}</td>
                    <td className="u-nowrap">{runWhen(run)}</td>
                    <td>
                      <RunStatusBadge status={run?.status ?? null} />
                    </td>
                    <td className="admin-cell-muted u-max-sm">{run?.summary ?? run?.error ?? "—"}</td>
                    <td className="admin-cell-mono u-right">
                      {t && t.calls > 0 ? `${tokens(t.input + t.output)} (${t.calls} calls)` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
