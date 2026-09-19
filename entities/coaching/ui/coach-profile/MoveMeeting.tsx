"use client";

import { useState } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { moveOneOnOne } from "@/entities/coaching/lib/schedule-actions";
import { type ActionResult } from "./shared";

// Move a 1-1 rather than skip it (K.33). Skip records a cycle that did not
// happen; a move records the same meeting on another day, so it keeps the row
// and everything attached to it — the prep, the member's pre-meeting answers,
// the commitments. The why is a one-line inline form for the same reason
// Skip's is: another human reads it on both pages.
export function MoveMeeting({
  m,
  run,
  busy,
}: {
  m: OneOnOne;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  // A 1-1 that happened is history and a skipped one is a cycle that did not
  // happen; neither is a thing you reschedule.
  if (m.status !== "scheduled") return null;

  return (
    <div className="coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Move this 1-1</span>
      </div>
      {open ? (
        <div className="admin-coach-add-row">
          <input
            className="admin-input"
            type="date"
            aria-label="New day"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="admin-input"
            placeholder="Why is it moving?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="admin-btn admin-btn--sm"
            disabled={busy || !date || !reason.trim()}
            onClick={() => {
              run("Move", () => moveOneOnOne(m.id, date, reason));
              setDate("");
              setReason("");
              setOpen(false);
            }}
          >
            Move
          </button>
          <button className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
          Move to another day
        </button>
      )}
    </div>
  );
}
