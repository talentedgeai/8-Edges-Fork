"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { columnFor, type BoardColumnId } from "@/entities/coaching/lib/types";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { STUCK_WHY_PLACEHOLDER } from "@/entities/coaching/lib/stuck-copy";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { AskNow } from "./AskNow";
import { CardDone } from "./CardDone";
import { CommitmentMoveMenu } from "./CommitmentMoveMenu";
import { CommitmentPlan } from "./CommitmentPlan";
import { useNarrow } from "./useNarrow";
import { formatDate } from "@/kernel/ui/format";

// One card on the commitment board (K.14, spec 2.2). Split out of
// CommitmentBoard.tsx for the file-size gate.
//
// The card carries three interactions the board itself cannot: rewording the
// text in place, the "why is it stuck" note that Blocked reveals, and the move
// menu that exists because drag-and-drop is unusable on a phone and with a
// keyboard. The menu is the accessible path to every move the drag offers.

// Supplied only on the coach page: push a commitment onto a task board and show
// its card's lane once pushed.
export type CommitmentBoardPush = {
  boards: { id: string; slug: string; name: string }[];
  cardFor: (c: Commitment) => { boardSlug: string; boardName: string; columnName: string; done: boolean } | null;
  onPush: (commitmentId: string, boardId: string) => void;
};

export function CommitmentCard({
  c,
  busy,
  ownerLabel,
  readOnly,
  canEdit,
  onMove,
  onRetitle,
  onNote,
  onDelete,
  onAskNow,
  onCardDoneDismiss,
  onPlan,
  boardPush,
  coachName,
}: {
  c: Commitment;
  busy: boolean;
  ownerLabel: string;
  // The other side's promises: shown, never moved or reworded from here.
  readOnly: boolean;
  canEdit: boolean;
  onMove: (column: BoardColumnId) => void;
  onRetitle: (title: string) => void;
  onNote: (note: string) => void;
  onDelete?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  // Supplied on the member's own board only: reach the coach today about a card
  // that is stuck (K.22).
  onAskNow?: () => void;
  // Supplied for the rows this viewer owns: answer the "your board card is
  // done" suggestion (2026-09-18). Absent on the other side's promises, so the
  // question only ever reaches the person who made the promise.
  onCardDoneDismiss?: () => void;
  // Supplied for the rows this viewer owns: write "when will you do it?" (L.1).
  onPlan?: (plan: string) => void;
  boardPush?: CommitmentBoardPush;
  // Who to ask, when the page knows (K.45).
  coachName?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [note, setNote] = useState(c.statusNote ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushBoardId, setPushBoardId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();

  // The server is the tiebreaker: a refresh after someone else's edit replaces
  // what this card is showing, unless the viewer is mid-edit.
  useEffect(() => {
    if (!editing) setTitle(c.title);
  }, [c.title, editing]);
  useEffect(() => setNote(c.statusNote ?? ""), [c.statusNote]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const column = columnFor(c.status);

  function commitTitle() {
    setEditing(false);
    const next = title.trim();
    if (!next || next === c.title) {
      setTitle(c.title);
      return;
    }
    onRetitle(next);
  }

  const menu = (
    <CommitmentMoveMenu
      column={column}
      busy={busy}
      coachName={coachName}
      onMove={(id) => {
        setMenuOpen(false);
        onMove(id);
      }}
    />
  );

  return (
    <div className="admin-cboard-card-body">
      <div className="admin-cboard-card-top">
        {editing ? (
          <input
            ref={inputRef}
            className="admin-input admin-cboard-card-input"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitle(c.title);
                setEditing(false);
              }
            }}
            aria-label="Commitment"
          />
        ) : (
          <button
            type="button"
            className="admin-cboard-card-title"
            disabled={!canEdit || busy}
            onClick={() => canEdit && setEditing(true)}
            title={canEdit ? "Click to reword" : undefined}
          >
            {c.title}
          </button>
        )}
        {!readOnly && (
          <div className="admin-cboard-menu-wrap">
            <button
              type="button"
              className="admin-cboard-menu-btn"
              disabled={busy}
              aria-label="Move this commitment"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ⋯
            </button>
            {menuOpen && (narrow ? createPortal(menu, document.body) : menu)}
          </div>
        )}
      </div>

      <div className="admin-cboard-card-meta">
        {ownerLabel}
        {c.dueOn ? ` · due ${formatDate(c.dueOn)}` : ""}
        {c.historyCount > 0 ? ` · changed ${c.historyCount}×` : ""}
      </div>

      {/* The plan the owner made for this card (L.1). Under the facts because
          it is the owner's own note about them, and above the stuck note
          because a plan that did not survive contact is what "stuck" is. */}
      <CommitmentPlan plan={c.planMd} canEdit={!readOnly && Boolean(onPlan)} busy={busy} onSave={(p) => onPlan?.(p)} />

      {c.status === "blocked" && !readOnly && (
        <input
          className="admin-input admin-cboard-why"
          placeholder={STUCK_WHY_PLACEHOLDER}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((c.statusNote ?? "") !== note) onNote(note);
          }}
          aria-label="What's in the way?"
        />
      )}
      {c.status === "blocked" && readOnly && c.statusNote && (
        <div className="admin-cboard-why-read">{c.statusNote}</div>
      )}
      {c.status === "blocked" && !readOnly && onAskNow && (
        <AskNow sentAt={c.askNowSentAt} busy={busy} onAsk={onAskNow} />
      )}
      {/* The board noticed a linked card finish; its owner decides what that
          means. "Mark it kept" is the ordinary move to Done, so their answer
          lands in the same history as any other move (2026-09-18). */}
      <CardDone c={c} busy={busy} onKept={() => onMove("done")} onDismiss={onCardDoneDismiss} />

      {canEdit && onDelete && (
        <div className="admin-cboard-card-foot">
          <ConfirmButton
            label="Delete"
            title={`Delete "${c.title}"?`}
            body="The commitment is removed from both your board and your coach's view."
            confirmLabel="Delete"
            disabled={busy}
            onConfirm={onDelete}
          />
        </div>
      )}

      {boardPush &&
        (boardPush.cardFor(c) ? (
          <div className="admin-cboard-card-meta">
            On {boardPush.cardFor(c)?.boardName}:{" "}
            {boardPush.cardFor(c)?.done ? "Done" : boardPush.cardFor(c)?.columnName || "—"}
          </div>
        ) : (
          <div className="admin-cboard-card-foot">
            <select
              className="admin-input"
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
