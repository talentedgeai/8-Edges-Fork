"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/Badge";
import { formatDate, humanize } from "@/lib/admin/format";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/lib/boards/types";
import type { MyWork, MyBoardSummary } from "@/lib/team/boards";
import { moveCard } from "@/app/admin/(dashboard)/boards/[slug]/actions";

export function MyTasks({ work, boards }: { work: MyWork; boards: MyBoardSummary[] }) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boardsView, setBoardsView] = useState<"card" | "list">("card");
  const [, startTransition] = useTransition();

  function markDone(taskId: string, doneColumnId: string | null, boardSlug: string) {
    if (!doneColumnId) {
      setBanner("That board has no done column.");
      return;
    }
    setBanner(null);
    setBusyId(taskId);
    moveCard(taskId, doneColumnId, boardSlug).then((r) => {
      setBusyId(null);
      if (!r.ok) setBanner(r.error);
      else startTransition(() => router.refresh());
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}

      <section className="admin-card admin-section-card u-mb-4">
        <div className="admin-card-head">
          <h2 className="admin-card-title">
            My boards <span className="admin-cell-muted">({boards.length})</span>
          </h2>
          {boards.length > 0 && (
            <div className="admin-viewtoggle">
              <button
                className={`admin-tab${boardsView === "card" ? " is-active" : ""}`}
                onClick={() => setBoardsView("card")}
              >
                Cards
              </button>
              <button
                className={`admin-tab${boardsView === "list" ? " is-active" : ""}`}
                onClick={() => setBoardsView("list")}
              >
                List
              </button>
            </div>
          )}
        </div>

        {boards.length === 0 ? (
          <span className="admin-cell-muted">You are not on any boards yet.</span>
        ) : boardsView === "card" ? (
          <div className="admin-kpi-grid">
            {boards.map((b) => {
              const total = b.openCount + b.doneCount;
              const pct = total > 0 ? Math.round((b.doneCount / total) * 100) : 0;
              return (
                <Link
                  key={b.id}
                  href={`/team/boards/${b.slug}`}
                  className="admin-card admin-section-card is-clickable admin-hub-program-card"
                >
                  <div className="u-row u-between">
                    <span className="admin-cell-strong">{b.name}</span>
                    {b.clientName && <Badge tone="info">Client</Badge>}
                  </div>
                  <div className="admin-cell-muted u-mt-1">
                    {b.clientName ?? "Internal"}
                  </div>
                  <div className="u-mt-4">
                    <div
                      className="admin-cell-muted admin-hub-program-progressrow"
                    >
                      <span>
                        {total === 0 ? "No cards yet" : b.openCount === 0 ? "All done" : `${b.openCount} open`}
                      </span>
                      {total > 0 && <span>{pct}% done</span>}
                    </div>
                    <div className="admin-progress">
                      <div className="admin-progress-fill" style={{ width: `${pct}%` }} /* layout-ok: data-driven width */ />
                    </div>
                  </div>
                  <div className="admin-cell-muted u-mt-3 u-sm">
                    {b.assignedToMe} assigned to you
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th className="admin-th--lg">Client</th>
                  <th className="admin-th--sm u-right">Open tasks</th>
                  <th className="admin-th--sm u-right">Assigned to me</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id} className="is-clickable" onClick={() => router.push(`/team/boards/${b.slug}`)}>
                    <td className="admin-cell-strong">{b.name}</td>
                    <td className="admin-cell-muted">{b.clientName ?? "Internal"}</td>
                    <td className="u-right">{b.openCount}</td>
                    <td className="u-right">{b.assignedToMe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">
          Assigned to me <span className="admin-cell-muted">({work.tasks.length})</span>
        </h2>
        {work.tasks.length === 0 ? (
          <span className="admin-cell-muted">Nothing assigned. Enjoy it.</span>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th className="admin-th--md">Board</th>
                  <th className="admin-th--sm">Column</th>
                  <th className="admin-th--sm">Priority</th>
                  <th className="admin-th--sm">Due</th>
                  <th className="admin-th--sm"></th>
                </tr>
              </thead>
              <tbody>
                {work.tasks.map((t) => {
                  const overdue = t.dueDate != null && t.dueDate < today;
                  return (
                    <tr key={t.id}>
                      <td className="admin-cell-strong">{t.title}</td>
                      <td>
                        <Link href={`/team/boards/${t.boardSlug}`} className="admin-cell-strong">
                          {t.boardName}
                        </Link>
                      </td>
                      <td className="admin-cell-muted">{t.columnName}</td>
                      <td>
                        <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                      </td>
                      <td className={`admin-cell-muted${overdue ? " u-err" : ""}`}>
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                      </td>
                      <td>
                        <button
                          className="admin-btn admin-btn--sm"
                          disabled={busyId === t.id}
                          onClick={() => markDone(t.id, t.doneColumnId, t.boardSlug)}
                        >
                          {busyId === t.id ? "…" : "Done"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {work.commitments.length > 0 && (
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-3">
            My open commitments <span className="admin-cell-muted">({work.commitments.length})</span>
          </h2>
          <div className="admin-hint u-mb-2">
            From your 1-1s. Update these in{" "}
            <Link href="/team/my-coaching" className="admin-cell-strong">
              My Coaching
            </Link>
            .
          </div>
          {work.commitments.map((c) => (
            <div
              key={c.id}
              className="admin-row-divided"
            >
              <span className="admin-cell-strong u-grow">
                {c.title}
              </span>
              <Badge tone="info">{humanize(c.status)}</Badge>
              {c.dueOn && <span className="admin-cell-muted">{formatDate(c.dueOn)}</span>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
