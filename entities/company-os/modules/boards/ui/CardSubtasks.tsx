"use client";

import { useState } from "react";
import type { BoardCard } from "@/entities/company-os/modules/boards/data";
import { addSubtask, setTaskTokens, toggleSubtask } from "@/entities/company-os/routes/(dashboard)/boards/[slug]/actions";
import type { RunAction } from "./board-view-types";

// A card's subtasks with their Human Tokens, in the card drawer. Split out of
// BoardView (Q3); it owns the new-subtask input.
export function CardSubtasks({ card, slug, saving, run }: { card: BoardCard; slug: string; saving: boolean; run: RunAction }) {
  const [newSubtask, setNewSubtask] = useState("");

  function addSub() {
    if (!newSubtask.trim()) return;
    run(() => addSubtask(card.id, newSubtask, slug), () => setNewSubtask(""));
  }
  function toggleSub(id: string, done: boolean) {
    run(() => toggleSubtask(id, done, slug));
  }
  // Saves a subtask's Human Tokens on blur; "" clears the estimate.
  function saveSubTokens(id: string, raw: string, current: number | null) {
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next === current) return;
    run(() => setTaskTokens(id, next, slug));
  }

  return (
    <div className="admin-field">
      <label className="admin-label">
        Subtasks
        {card && card.subtasks.length > 0
          ? ` (${card.subtasks.filter((s) => s.done).length}/${card.subtasks.length})`
          : ""}
      </label>
      {card?.subtasks.map((s) => (
        <div key={s.id} className="u-row u-py-1">
          <input
            type="checkbox"
            checked={s.done}
            onChange={(e) => toggleSub(s.id, e.target.checked)}
            disabled={saving}
          />
          <span className={`u-grow${s.done ? " u-muted admin-subtask-title--done" : ""}`}>
            {s.title}
          </span>
          <input
            className="admin-input u-w-90 u-shrink-none"
            type="number"
            min={0}
            step={1}
            placeholder="HT"
            title="Human Tokens"
            key={`${s.id}-${s.human_tokens ?? ""}`}
            defaultValue={s.human_tokens ?? ""}
            onBlur={(e) => saveSubTokens(s.id, e.target.value, s.human_tokens)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={saving}
                                />
        </div>
      ))}
      <div className="u-row u-mt-2">
        <input
          className="admin-input"
          placeholder="Add a subtask…"
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSub();
            }
          }}
        />
        <button className="admin-btn" onClick={addSub} disabled={saving || !newSubtask.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
