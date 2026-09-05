"use client";

import { useState } from "react";
import { timeAgo } from "@/kernel/ui/format";
import type { BoardCard } from "@/entities/company-os/modules/boards/data";
import { addComment } from "@/entities/company-os/routes/(dashboard)/boards/[slug]/actions";
import type { RunAction } from "./board-view-types";

// A card's comment thread, in the card drawer. Split out of BoardView (Q3);
// it owns the new-comment input.
export function CardComments({ card, slug, saving, run }: { card: BoardCard; slug: string; saving: boolean; run: RunAction }) {
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
      <div className="u-row u-mt-2">
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
      </div>
    </div>
  );
}
