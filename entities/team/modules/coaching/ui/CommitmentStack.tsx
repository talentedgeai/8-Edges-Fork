"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { Commitment } from "../data/rows";
import { COMMITMENT_STATUS_LABELS, OPEN_COMMITMENT_STATUSES, type CommitmentStatus } from "@/entities/team/modules/coaching/types";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";

// The commitment stack, shared by the coach page and /team/my-coaching. One
// card per commitment, dragged into priority order top-down. Both surfaces
// write the same sort_order, so the two pages always agree on what matters
// most (lib/coaching/data.ts, applyCommitmentOrder).
//
// Only OPEN commitments are draggable: a closed one has no priority left to
// express, and mixing them would make the top of the stack meaningless.

const STATUS_BADGE: Record<CommitmentStatus, string> = {
  open: "admin-badge--info",
  on_track: "admin-badge--ok",
  needs_attention: "admin-badge--warn",
  completed: "admin-badge--ok",
  dropped: "admin-badge--err",
  blocked: "admin-badge--err",
};

const isOpen = (c: Commitment) =>
  (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status);

// Supplied only where the viewer may author: the coach page passes nothing and
// gets read-only cards with drag, the member page passes this and gets edit and
// delete on the commitments they wrote.
export type CommitmentAuthoring = {
  canEdit: (c: Commitment) => boolean;
  onEdit: (id: string, title: string, dueOn: string | null) => void;
  // Returns the action's Result so the delete confirm modal can show a failure.
  onDelete: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

// Supplied only on the coach page: lets the coach push a commitment onto a task
// board and shows its card status inline once pushed.
export type CommitmentBoardPush = {
  boards: { id: string; slug: string; name: string }[];
  cardFor: (c: Commitment) => { boardSlug: string; boardName: string; columnName: string; done: boolean } | null;
  onPush: (commitmentId: string, boardId: string) => void;
};

export function CommitmentStack({
  commitments,
  busy,
  ownerLabel,
  onStatus,
  onReorder,
  authoring,
  boardPush,
  emptyText = "No open commitments.",
}: {
  commitments: Commitment[];
  busy: boolean;
  ownerLabel: (c: Commitment) => string;
  onStatus: (id: string, status: CommitmentStatus, note: string) => void;
  onReorder: (orderedIds: string[]) => void;
  authoring?: CommitmentAuthoring;
  boardPush?: CommitmentBoardPush;
  emptyText?: string;
}) {
  // Local copy so a drag lands instantly; the server is the tiebreaker on the
  // next refresh, which this effect picks up.
  const [order, setOrder] = useState<Commitment[]>(commitments);
  useEffect(() => setOrder(commitments), [commitments]);

  const open = order.filter(isOpen);
  const closed = order.filter((c) => !isOpen(c));

  function onDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const next = [...open];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    setOrder([...next, ...closed]);
    onReorder(next.map((c) => c.id));
  }

  return (
    <>
      {open.length === 0 && <div className="admin-empty">{emptyText}</div>}
      {open.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="commitments">
            {(dropProvided) => (
              <div
                className="admin-coach-commit-stack"
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
              >
                {open.map((c, i) => (
                  <Draggable draggableId={c.id} index={i} key={c.id} isDragDisabled={busy}>
                    {(provided, snapshot) => (
                      <div
                        className={`admin-coach-commit-card${snapshot.isDragging ? " is-dragging" : ""}`}
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <span
                          className="admin-coach-commit-handle"
                          {...provided.dragHandleProps}
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                        >
                          ⠿
                        </span>
                        <CommitmentCard
                          c={c}
                          busy={busy}
                          ownerLabel={ownerLabel}
                          onStatus={onStatus}
                          authoring={authoring}
                          boardPush={boardPush}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {closed.length > 0 && (
        <details className="admin-coach-closed">
          <summary>{closed.length} closed</summary>
          {closed.map((c) => (
            <div key={c.id} className="admin-coach-commitment is-closed">
              <span className={`admin-badge ${STATUS_BADGE[c.status]}`}>
                {COMMITMENT_STATUS_LABELS[c.status]}
              </span>
              <span>{c.title}</span>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

function CommitmentCard({
  c,
  busy,
  ownerLabel,
  onStatus,
  authoring,
  boardPush,
}: {
  c: Commitment;
  busy: boolean;
  ownerLabel: (c: Commitment) => string;
  onStatus: (id: string, status: CommitmentStatus, note: string) => void;
  authoring?: CommitmentAuthoring;
  boardPush?: CommitmentBoardPush;
}) {
  const [note, setNote] = useState(c.statusNote ?? "");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [dueOn, setDueOn] = useState(c.dueOn ?? "");
  const [pushBoardId, setPushBoardId] = useState("");
  const mine = authoring?.canEdit(c) ?? false;
  const pushedCard = boardPush?.cardFor(c) ?? null;

  useEffect(() => setNote(c.statusNote ?? ""), [c.statusNote]);

  if (editing && authoring) {
    return (
      <div className="admin-coach-commit-body">
        <div className="admin-coach-commit-edit">
          <input
            className="admin-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Commitment"
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
            className="admin-btn admin-btn--primary"
            disabled={busy || !title.trim()}
            onClick={() => {
              authoring.onEdit(c.id, title, dueOn || null);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              setTitle(c.title);
              setDueOn(c.dueOn ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-coach-commit-body">
      <div className="admin-coach-commit-top">
        <span className={`admin-badge ${STATUS_BADGE[c.status]}`}>
          {COMMITMENT_STATUS_LABELS[c.status]}
        </span>
        <span className="admin-coach-commitment-title">{c.title}</span>
        <span className="admin-cell-muted">
          {ownerLabel(c)}
          {c.dueOn ? ` · due ${formatDate(c.dueOn)}` : ""}
        </span>
      </div>
      <div className="admin-coach-commitment-controls">
        <select
          className="admin-input"
          value={c.status}
          disabled={busy}
          onChange={(e) => onStatus(c.id, e.target.value as CommitmentStatus, note)}
          aria-label="Status"
        >
          {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="admin-input"
          placeholder="One-line status update…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((c.statusNote ?? "") !== note) onStatus(c.id, c.status, note);
          }}
        />
        {mine && authoring && (
          <>
            <button type="button" className="admin-btn" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
            <ConfirmButton
              label="Delete"
              title={`Delete "${c.title}"?`}
              body="The commitment is removed from both your stack and your coach's view."
              confirmLabel="Delete"
              disabled={busy}
              onConfirm={() => authoring.onDelete(c.id)}
            />
          </>
        )}
      </div>
      {boardPush &&
        (pushedCard ? (
          <div className="admin-cell-muted u-mt-2 u-sm">
            On {pushedCard.boardName}: {pushedCard.done ? "Done" : pushedCard.columnName || "—"}
          </div>
        ) : (
          <div className="u-row u-wrap u-mt-2">
            <select
              className="admin-input u-max-3"
              value={pushBoardId}
              onChange={(e) => setPushBoardId(e.target.value)}
              disabled={busy}
              aria-label="Board"
            >
              <option value="">Push to board…</option>
              {boardPush.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-btn"
              disabled={busy || !pushBoardId}
              onClick={() => boardPush.onPush(c.id, pushBoardId)}
            >
              Push
            </button>
          </div>
        ))}
    </div>
  );
}
