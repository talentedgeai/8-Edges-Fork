"use client";

import { useState } from "react";
import type { DealCard } from "./types";
import { REJECT_REASONS } from "./types";

// The pending-handoff banner at the top of the shelf: accept the lead the
// team handed over, or reject it with a reason. Split out of DealDetail (Q3).
export function DealHandoffBanner({ card, onDecideHandoff }: {
  card: DealCard;
  onDecideHandoff: (cardId: string, decision: "accepted" | "rejected", rejectReason?: string) => void;
}) {
  const pendingHandoff = card.handoffStatus === "pending";
  const [rejectingHandoff, setRejectingHandoff] = useState(false);
  const [handoffReason, setHandoffReason] = useState("");

  return (
    <>
      {pendingHandoff && (
        <div className="u-mb-4">
          <div className="admin-label u-mb-2">
            SDR handoff
          </div>
          {rejectingHandoff ? (
            <div className="u-stack">
              <select
                className="admin-input"
                aria-label="Reject reason"
                value={handoffReason}
                onChange={(e) => setHandoffReason(e.target.value)}
              >
                <option value="">Why reject this handoff?</option>
                {REJECT_REASONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <div className="u-row">
                <button
                  type="button"
                  className="admin-btn admin-btn--danger"
                  disabled={!handoffReason}
                  onClick={() => onDecideHandoff(card.id, "rejected", handoffReason)}
                >
                  Confirm reject
                </button>
                <button type="button" className="admin-btn" onClick={() => setRejectingHandoff(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="u-row u-wrap">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => onDecideHandoff(card.id, "accepted")}
              >
                Accept handoff
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setRejectingHandoff(true);
                  setHandoffReason("");
                }}
              >
                Reject…
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
