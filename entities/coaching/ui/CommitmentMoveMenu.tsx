"use client";

import { BOARD_COLUMN_LABELS, type BoardColumnId } from "@/entities/coaching/lib/types";
import { stuckMoveHint } from "@/entities/coaching/lib/stuck-copy";

// The card's ⋯ menu: every move the drag offers, reachable from a phone and a
// keyboard. It exists because drag-and-drop is unusable on both, so this is the
// accessible path rather than a convenience — a move available only by drag is
// a move some people cannot make.
//
// Split out of CommitmentCard.tsx, which sits at the 250-line client-component
// cap; the card keeps deciding WHERE the menu renders (inline, or portalled to
// the body on a phone, because a transformed drag ancestor would otherwise pin
// a fixed-position sheet to a moving box).

export function CommitmentMoveMenu({
  column,
  busy,
  coachName,
  onMove,
}: {
  /** The column the card is in now, which is the one move not offered. */
  column: BoardColumnId | null;
  busy: boolean;
  /** Who to ask, when the page knows, so Stuck names a person (K.45). */
  coachName?: string | null;
  onMove: (column: BoardColumnId) => void;
}) {
  return (
    <div className="admin-cboard-menu" role="menu">
      {(Object.keys(BOARD_COLUMN_LABELS) as BoardColumnId[])
        .filter((id) => id !== column)
        .map((id) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="admin-cboard-menu-item"
            disabled={busy}
            onClick={() => onMove(id)}
          >
            Move to {BOARD_COLUMN_LABELS[id]}
            {/* Stuck is the one move that is also a request, so the menu says
                what moving there actually does for you (K.45). */}
            {id === "blocked" && <span className="admin-cboard-menu-hint">{stuckMoveHint(coachName)}</span>}
          </button>
        ))}
    </div>
  );
}
