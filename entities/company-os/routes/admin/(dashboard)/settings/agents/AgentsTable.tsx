"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RoutineRunStatus } from "@/kernel/audit/routine-runs";
import { formatDate } from "@/kernel/ui/format";
import { RunStatusBadge, tokens } from "./RunBits";

// The Agents list, sortable on every column. Rows arrive pre-joined from the
// server page (routine definition + latest run + token spend) so this client
// component only orders and renders them. A null sortKey keeps the server's
// order: Vercel crons in vercel.json order, then the Mac mini jobs.

export type AgentRow = {
  id: string;
  name: string;
  description: string;
  host: "vercel" | "mac-mini";
  schedule: string;
  lastRunAt: string | null;
  status: RoutineRunStatus | null;
  reported: string | null;
  tokens: number;
  calls: number;
};

type SortKey = "name" | "host" | "schedule" | "lastRunAt" | "status" | "reported" | "tokens";

// Outcome sorts by severity, not alphabetically: failures first when ascending.
const STATUS_RANK: Record<string, number> = { error: 0, running: 1, skipped: 2, ok: 3 };

function HostBadge({ host }: { host: AgentRow["host"] }) {
  return host === "vercel" ? (
    <span className="admin-badge admin-badge--info admin-badge--dot">Vercel</span>
  ) : (
    <span className="admin-badge admin-badge--ok admin-badge--dot">Mac mini</span>
  );
}

export function AgentsTable({ rows, tokenWindowDays }: { rows: AgentRow[]; tokenWindowDays: number }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "name", label: "Routine", className: "admin-th--lg" },
    { key: "host", label: "Host" },
    { key: "schedule", label: "Schedule" },
    { key: "lastRunAt", label: "Last run" },
    { key: "status", label: "Outcome" },
    { key: "reported", label: "What it reported" },
    { key: "tokens", label: `AI tokens, ${tokenWindowDays}d`, className: "u-right" },
  ];

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortAsc ? 1 : -1;
    const value = (r: AgentRow): string | number | null => {
      switch (sortKey) {
        case "tokens":
          return r.tokens;
        case "status":
          return r.status ? STATUS_RANK[r.status] : null;
        default:
          return r[sortKey];
      }
    };
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Blanks (never run, nothing reported) always sort to the bottom.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortAsc]);

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  <button
                    type="button"
                    className="admin-th-sort"
                    onClick={() => toggleSort(c.key)}
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.label}
                    <span className="admin-team-dir-caret" aria-hidden>
                      {sortKey === c.key ? (sortAsc ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/settings/agents/${encodeURIComponent(r.id)}`} className="u-strong u-ink">
                    {r.name}
                  </Link>
                  <div className="admin-cell-muted u-mt-1 u-max-sm">{r.description}</div>
                </td>
                <td>
                  <HostBadge host={r.host} />
                </td>
                <td className="u-nowrap">{r.schedule}</td>
                <td className="u-nowrap">{r.lastRunAt ? formatDate(r.lastRunAt) : "—"}</td>
                <td>
                  <RunStatusBadge status={r.status} />
                </td>
                <td className="admin-cell-muted u-max-sm">{r.reported ?? "—"}</td>
                <td className="admin-cell-mono u-right">
                  {r.calls > 0 ? `${tokens(r.tokens)} (${r.calls} calls)` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
