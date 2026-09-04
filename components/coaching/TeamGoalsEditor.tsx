"use client";

import { useState, useTransition } from "react";
import type { TeamMemberGoal } from "@/lib/coaching/data";
import { addGoal, deleteGoal, updateGoal } from "@/app/team/(dashboard)/coaching/actions";
import { GoalComments } from "@/components/coaching/GoalComments";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

// FAST goals on a directory profile. Everyone sees them (and can comment);
// managers get Add / Edit / Delete for any team member. The full editor
// (status lifecycle, Edges ladder picker) stays on the coaching page.
export function TeamGoalsEditor({
  profileId,
  goals,
  canManage,
}: {
  profileId: string;
  goals: TeamMemberGoal[];
  canManage: boolean;
}) {
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {goals.length === 0 && <div className="admin-cell-muted">No active FAST goal yet.</div>}
      <ul className="admin-mycoach-priorities">
        {goals.map((g) => (
          <li key={g.goalId}>
            {editingId === g.goalId ? (
              <span className="admin-coach-add-row">
                <input
                  className="admin-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <button
                  className="admin-btn admin-btn--sm admin-btn--primary"
                  disabled={busy || !editTitle.trim()}
                  onClick={() => {
                    run(() => updateGoal(profileId, g.goalId, { title: editTitle }));
                    setEditingId(null);
                  }}
                >
                  Save
                </button>
                <button className="admin-btn admin-btn--sm" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <>
                <strong>{g.title}</strong>
                {g.ladderLabel && <span className="admin-cell-muted"> · ladders to {g.ladderLabel}</span>}
                {canManage && (
                  <span className="admin-goal-manage-btns">
                    <button
                      className="admin-btn admin-btn--sm"
                      onClick={() => {
                        setEditingId(g.goalId);
                        setEditTitle(g.title);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmButton
                      label="Delete"
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      title="Delete this FAST goal?"
                      body="Its comments go with it."
                      confirmLabel="Delete"
                      disabled={busy}
                      onConfirm={() => deleteGoal(profileId, g.goalId)}
                    />
                  </span>
                )}
              </>
            )}
            <GoalComments goalId={g.goalId} comments={g.comments} />
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="admin-coach-add-row">
          <input
            className="admin-input"
            placeholder="New FAST goal…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            className="admin-btn"
            disabled={busy || !title.trim()}
            onClick={() => {
              run(() => addGoal(profileId, title, "active", "2026-Q3", { kind: "none" }));
              setTitle("");
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
