"use client";

import { reassign } from "@/entities/coaching/lib/stack-order";
import { useOptimistic, useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { CommitmentStatus } from "@/entities/coaching/lib/types";
import { OPEN_COMMITMENT_STATUSES } from "@/entities/coaching/lib/types";
import { addCommitment, dismissCardDone, pushCommitmentToBoard, retitleCommitment, setCommitmentPlan, reorderCommitments, updateCommitmentStatus } from "@/entities/coaching/lib/commitment-actions";
import { CommitmentBoard } from "@/entities/coaching/ui/CommitmentBoard";
import { type ActionResult } from "./shared";

// The coach's half of the same board the member sees (K.14). Mirrored: the
// coach moves and rewords their OWN promises, and the read-only fourth column
// holds what the member promised, with the "why is it stuck" note they wrote.

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
  // The dropped card lands in its column at once and stays there unless the
  // write fails, when useOptimistic puts it back (same reason as MyCommitments).
  const [shown, showChange] = useOptimistic(
    detail.commitments,
    (list: CoachProfileDetail["commitments"], m: { id: string; status: CommitmentStatus } | { order: string[] }) => {
      // Same rule as the member's board: the drop lands where the write will.
      if ("order" in m) {
        const next = new Map(reassign(m.order, list.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))).map((r) => [r.id, r.sortOrder]));
        return list.map((c) => (next.has(c.id) ? { ...c, sortOrder: next.get(c.id) as number } : c));
      }
      return list.map((c) => (c.id === m.id ? { ...c, status: m.status } : c));
    },
  );
  const byId = (id: string) => detail.commitments.find((c) => c.id === id) ?? null;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Commitments <span className="admin-cell-muted">({openCount} open)</span>
      </div>
      <div className="admin-hint">
        What you both said you&apos;d get done before the next 1-1. Drag your own cards between
        columns or use the card&apos;s menu; they see the same board.
      </div>

      <CommitmentBoard
        commitments={shown}
        busy={busy}
        viewerOwner="coach"
        promisedLabel={`${detail.member.name} promised`}
        ownerLabel={(c) => (c.owner === "coach" ? "me" : "them")}
        canEdit={(c) => c.owner === "coach"}
        onMove={(id, status, note) =>
          run("Commitment", () => {
            showChange({ id, status });
            return updateCommitmentStatus(id, status, note);
          })
        }
        onReorder={(order) =>
          run("Commitment", () => {
            showChange({ order });
            return reorderCommitments(order);
          })
        }
        onNote={(id, note) => {
          const c = byId(id);
          if (c) run("Commitment", () => updateCommitmentStatus(id, c.status, note));
        }}
        onRetitle={(id, t) => run("Commitment", () => retitleCommitment(id, t))}
        onCardDoneDismiss={(id) => run("Commitment", () => dismissCardDone(id, detail.profileId))}
        onPlan={(id, plan) => run("Commitment", () => setCommitmentPlan(id, plan))}
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
