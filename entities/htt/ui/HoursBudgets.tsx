"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { ok: boolean; error?: string };

// The per-person daily focus budget strip above the hours ledger: "Name ·
// budget 6 h/day [Edit]". Editable by an admin or by the person themselves.
export function HoursBudgets({
  people,
  budgets,
  viewerPersonId,
  canEditAll,
  budgetAction,
}: {
  people: Array<[string, string]>; // [person id, name]
  budgets: Record<string, number>;
  viewerPersonId: string | null;
  canEditAll: boolean;
  budgetAction?: (personId: string, hours: number) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function save(personId: string) {
    if (!budgetAction) return;
    setErr(null);
    start(async () => {
      const res = await budgetAction(personId, Number(value));
      if (!res.ok) setErr(res.error ?? "Could not save.");
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="u-row u-wrap u-gap-1 u-sm admin-cell-muted">
      {people.map(([id, name]) => (
        <span key={id} className="u-row u-gap-1 u-items-center">
          {name} · budget{" "}
          {editing === id ? (
            <>
              <input
                className="admin-input admin-input--w-xs"
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => save(id)}>
                Save
              </button>
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {(budgets[id] ?? 6).toLocaleString(undefined, { maximumFractionDigits: 2 })} h/day
              {budgetAction && (canEditAll || id === viewerPersonId) && (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => {
                    setEditing(id);
                    setValue(String(budgets[id] ?? 6));
                  }}
                >
                  Edit
                </button>
              )}
            </>
          )}
        </span>
      ))}
      {err && <span className="u-err">{err}</span>}
    </div>
  );
}
