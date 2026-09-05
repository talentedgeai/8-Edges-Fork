"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "../../data/profile";
import type { CommitmentStatus } from "../../types";
import { OPEN_COMMITMENT_STATUSES } from "@/entities/team/modules/coaching/types";
import { addCommitment, pushCommitmentToBoard, reorderCommitments, updateCommitmentStatus } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { CommitmentStack } from "@/entities/team/modules/coaching/ui/CommitmentStack";
import { type ActionResult } from "./shared";

export function CommitmentsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<"member" | "coach">("member");
  const [dueOn, setDueOn] = useState("");
  const openCount = detail.commitments.filter((c) =>
    (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
  ).length;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Commitments <span className="admin-cell-muted">({openCount} open)</span>
      </div>
      <div className="admin-hint">
        What you both said you&apos;d get done before the next 1-1. Drag to reorder; they see the same stack.
      </div>

      <CommitmentStack
        commitments={detail.commitments}
        busy={busy}
        ownerLabel={(c) => (c.owner === "coach" ? "me" : "them")}
        onStatus={(id, status, note) =>
          run("Commitment", () => updateCommitmentStatus(id, status, note))
        }
        onReorder={(ids) => run("Order", () => reorderCommitments(detail.profileId, ids))}
        boardPush={{
          boards: detail.boards,
          cardFor: (c) => detail.commitmentCards[c.id] ?? null,
          onPush: (id, boardId) => run("Push to board", () => pushCommitmentToBoard(id, boardId, detail.profileId)),
        }}
      />

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="New commitment…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className="admin-input" value={owner} onChange={(e) => setOwner(e.target.value as "member" | "coach")}>
          <option value="member">{detail.member.name}</option>
          <option value="coach">Me</option>
        </select>
        <input className="admin-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        <button
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() => {
            run("Commitment", () => addCommitment(detail.profileId, title, owner, dueOn || null));
            setTitle("");
            setDueOn("");
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}
