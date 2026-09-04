"use client";

import { useState, useTransition } from "react";
import type { Commitment } from "@/lib/coaching/data";
import { CommitmentStack } from "@/components/coaching/CommitmentStack";
import {
  addMyCommitment,
  deleteMyCommitment,
  editMyCommitment,
  reorderMyCommitments,
  updateMyCommitment,
} from "@/app/team/(dashboard)/my-coaching/actions";

// The member's commitment stack on /team/my-coaching. They can commit to their
// own work, retitle or drop what they wrote, and drag the whole stack (theirs
// and their coach's) into the order they actually intend to work it. Updating a
// status also answers the latest mid-cycle check-in (handled server-side).
//
// teamMemberId is the viewer's own id, used only to decide which cards show
// Edit and Delete. The server re-derives authorship on every write, so a forged
// id here buys nothing.

export function MyCommitments({
  commitments,
  teamMemberId,
}: {
  commitments: Commitment[];
  teamMemberId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else after?.();
    });
  };

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <CommitmentStack
        commitments={commitments}
        busy={busy}
        ownerLabel={(c) => (c.owner === "coach" ? "your coach owns this" : "yours")}
        onStatus={(id, status, note) => run(() => updateMyCommitment(id, status, note))}
        onReorder={(ids) => run(() => reorderMyCommitments(ids))}
        emptyText="No open commitments right now."
        authoring={{
          canEdit: (c) => c.createdBy === teamMemberId,
          onEdit: (id, t, d) => run(() => editMyCommitment(id, t, d)),
          onDelete: (id) => deleteMyCommitment(id),
        }}
      />

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="Commit to something…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New commitment"
        />
        <input
          className="admin-input"
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          aria-label="Due date"
        />
        <button
          type="button"
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() =>
            run(
              () => addMyCommitment(title, dueOn || null),
              () => {
                setTitle("");
                setDueOn("");
              },
            )
          }
        >
          Add
        </button>
      </div>
    </>
  );
}
