"use client";

import { useState } from "react";
import { timeAgo } from "@/kernel/ui/format";
import type { BoardCard } from "@/entities/boards/lib/data";
import { addComment } from "@/entities/boards/lib/actions";
import type { RunAction } from "./board-view-types";

// A card's comment thread, in the card drawer. Split out of BoardView (Q3);
// it owns the new-comment input.
export function CardComments({
  card,
  slug,
  saving,
  run,
  readOnly = false,
}: {
  card: BoardCard;
  slug: string;
  saving: boolean;
  run: RunAction;
  readOnly?: boolean;
}) {
  const [newComment, setNewComment] = useState("");

  function addCmt() {
    if (!newComment.trim()) return;
    run(() => addComment(card.id, newComment, slug), () => setNewComment(""));
  }

  return (
    <div className="admin-field">
      <label className="admin-label">
        Comments{card && card.comments.length > 0 ? ` (${card.comments.length})` : ""}
      </label>
      {card?.comments.map((c) => (
        <div key={c.id} className="admin-block-divided">
          <div className="u-row">
            <span className="admin-cell-strong u-sm">
              {c.author}
            </span>
            <span className="admin-cell-muted u-xs">
              {timeAgo(c.createdAt)}
            </span>
          </div>
          <div className="u-sm u-prewrap u-mt-1">{c.body}</div>
        </div>
      ))}
      {!readOnly && <div className="u-row u-mt-2">
        <textarea
          className="admin-textarea u-grow"
          rows={2}
          placeholder="Add a comment…"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <button
          className="admin-btn u-self-end"
          onClick={addCmt}
          disabled={saving || !newComment.trim()}
        >
          Comment
        </button>
      </div>}
    </div>
  );
}
