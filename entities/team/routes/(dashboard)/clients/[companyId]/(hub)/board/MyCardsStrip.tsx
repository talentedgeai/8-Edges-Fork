"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MoveCard, TaskPriority } from "@/entities/company-os";

// "My tasks" on the hub Board tab: the board member's open cards with quick
// move controls. `onMove` is team's shared moveCard server action — it
// re-checks board membership (boardActorFor), logs the stage move, and syncs
// commitments, so this strip is presentation only. The page hands it over as
// a prop, with the priority labels, because this is a client component and
// the company-os door is a server-only barrel (ME-11).

export type MyStripCard = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  columnId: string | null;
};

type Column = { id: string; name: string; isDone: boolean };

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MyCardsStrip({
  cards,
  columns,
  boardSlug,
  onMove,
  priorityLabel,
}: {
  cards: MyStripCard[];
  columns: Column[];
  boardSlug: string;
  onMove: MoveCard;
  priorityLabel: Record<TaskPriority, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doneColumn = columns.find((c) => c.isDone) ?? null;

  function move(taskId: string, toColumnId: string) {
    setError(null);
    setBusyId(taskId);
    startTransition(async () => {
      const r = await onMove(taskId, toColumnId, boardSlug);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (cards.length === 0) return null;

  return (
    <section className="admin-card admin-section-card u-mb-4">
      <h2 className="admin-card-title u-mb-3">
        My tasks ({cards.length})
      </h2>
      <div className="admin-list">
        {cards.map((c) => (
          <div className="admin-list-row" key={c.id}>
            <div className="admin-list-main">
              <div className="admin-list-title">{c.title}</div>
              <div className="admin-list-sub">
                {priorityLabel[c.priority] ?? c.priority}
                {c.dueDate && ` · due ${formatDay(c.dueDate)}`}
              </div>
            </div>
            <div className="admin-list-aside u-row">
              <select
                className="admin-select u-w-auto"
                value={c.columnId ?? ""}
                disabled={pending && busyId === c.id}
                onChange={(e) => e.target.value && move(c.id, e.target.value)}
                aria-label={`Move "${c.title}" to column`}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
              {doneColumn && c.columnId !== doneColumn.id && (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  disabled={pending && busyId === c.id}
                  onClick={() => move(c.id, doneColumn.id)}
                >
                  {pending && busyId === c.id ? "…" : "Done"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
    </section>
  );
}
