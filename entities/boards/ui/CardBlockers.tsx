"use client";

import { useState } from "react";
import type { BoardCard, BoardPerson } from "@/entities/boards/lib/data";
import { addBlocker, setBlockerAssignee, toggleBlocker } from "@/entities/boards/lib/blocker-actions";
import type { RunAction } from "./board-view-types";

// A card's blockers, in the card drawer. Works exactly like subtasks (BL-01):
// add a blocker, optionally tag it to a team member or a client contact, and
// mark it resolved. Split out alongside CardSubtasks; it owns the new-blocker
// input and the tag picker.
export function CardBlockers({
  card,
  slug,
  people,
  clientContacts,
  saving,
  run,
  readOnly = false,
}: {
  card: BoardCard;
  slug: string;
  people: BoardPerson[];
  clientContacts: BoardPerson[];
  saving: boolean;
  run: RunAction;
  readOnly?: boolean;
}) {
  const [newBody, setNewBody] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  function add() {
    if (!newBody.trim()) return;
    run(() => addBlocker(card.id, newBody, newAssignee || null, slug), () => {
      setNewBody("");
      setNewAssignee("");
    });
  }
  function toggle(id: string, resolved: boolean) {
    run(() => toggleBlocker(id, resolved, slug));
  }
  function retag(id: string, assigneeId: string) {
    run(() => setBlockerAssignee(id, assigneeId || null, slug));
  }

  // The tag picker: team members and client contacts in two labelled groups.
  const tagOptions = (
    <>
      <option value="">Untagged</option>
      {people.length > 0 && (
        <optgroup label="Team">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {clientContacts.length > 0 && (
        <optgroup label="Client">
          {clientContacts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  const unresolved = card.blockers.filter((b) => !b.resolved).length;

  return (
    <div className="admin-field">
      <label className="admin-label">
        Blockers
        {card.blockers.length > 0 ? ` (${unresolved} open of ${card.blockers.length})` : ""}
      </label>
      {card.blockers.map((b) => (
        <div key={b.id} className="u-row u-py-1">
          <input
            type="checkbox"
            checked={b.resolved}
            onChange={(e) => toggle(b.id, e.target.checked)}
            disabled={saving}
            title={b.resolved ? "Resolved" : "Mark resolved"}
          />
          <span className={`u-grow${b.resolved ? " u-muted admin-subtask-title--done" : ""}`}>{b.body}</span>
          <select
            className="admin-select u-w-160 u-shrink-none"
            value={b.assignee_id ?? ""}
            onChange={(e) => retag(b.id, e.target.value)}
            disabled={saving || readOnly}
            title="Tag someone"
          >
            {tagOptions}
          </select>
        </div>
      ))}
      {!readOnly && (
        <div className="u-row u-mt-2">
          <input
            className="admin-input"
            placeholder="Add a blocker…"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            className="admin-select u-w-160 u-shrink-none"
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            title="Tag someone (optional)"
          >
            {tagOptions}
          </select>
          <button className="admin-btn" onClick={add} disabled={saving || !newBody.trim()}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
