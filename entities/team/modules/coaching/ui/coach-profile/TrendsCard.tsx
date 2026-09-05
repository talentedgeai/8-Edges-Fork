"use client";

import type { CoachProfileDetail } from "../../data/profile";
import { runTrendReport } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { type RenderedHtml, type ActionResult } from "./shared";
import { formatDate } from "@/kernel/ui/format";

export function TrendsCard({
  detail,
  html,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const summarized = detail.meetings.filter((m) => m.status === "held" && m.summaryMarkdown).length;
  const canRun = summarized >= 2;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Trend report <span className="admin-cell-muted">across the last 3 1-1s</span>
      </div>
      <div className="admin-hint">
        A read across the recent 1-1s: trajectory, recurring themes, follow-through, mode split, and what to coach next.
        Needs at least 2 summarized 1-1s.
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn"
          disabled={busy || !canRun}
          onClick={() => run("Trend report", () => runTrendReport(detail.profileId))}
        >
          Run trend report
        </button>
      </div>
      {detail.trends.length === 0 && (
        <div className="admin-empty">
          {canRun
            ? "No trend report yet. Run one across the last 3 1-1s."
            : "A trend report needs at least 2 summarized 1-1s."}
        </div>
      )}
      {detail.trends.map((t) => (
        <details key={t.id} className="admin-coach-trend">
          <summary>
            <strong>Trend as of {t.createdAt ? formatDate(t.createdAt) : "-"}</strong>
            {t.aiError && <span className="admin-badge admin-badge--err">failed</span>}
          </summary>
          {html.trends[t.id] ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.trends[t.id]! }} />
          ) : (
            <div className="admin-cell-muted">{t.aiError ?? "Empty."}</div>
          )}
        </details>
      ))}
    </section>
  );
}
