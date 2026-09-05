"use client";

import { useState } from "react";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { demoteDealToLead } from "./actions";
import { type DealCard, type MoveOpts, LOST_REASONS } from "./types";

// The stage picker with its lost-reason and won-amount prompts, and the
// demote-to-lead confirm that sits under it. Split out of DealDetail (Q3).
export function DealStageControls({ card, stages, lostSet, wonSet, onChangeStage, onPatch, onClose }: {
  card: DealCard;
  stages: KanbanColumn[];
  lostSet: Set<string>;
  wonSet: Set<string>;
  onChangeStage: (cardId: string, toStageId: string, opts?: MoveOpts) => void;
  onPatch: (patch: Partial<DealCard>) => void;
  onClose: () => void;
}) {
  const archived = !!card.archivedAt;
  const pendingHandoff = card.handoffStatus === "pending";
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [pendingWonStage, setPendingWonStage] = useState<string | null>(null);
  const [wonAmount, setWonAmount] = useState("");
  const [demoteReason, setDemoteReason] = useState("");

  return (
    <>
      <div className="u-mb-4">
        <div className="admin-label u-mb-2">
          Stage
        </div>
        <select
          className="admin-input"
          aria-label="Deal stage"
          value={pendingLostStage ?? pendingWonStage ?? (pendingHandoff ? "" : card.stageId ?? "")}
          onChange={(e) => {
            const to = e.target.value;
            if (!to) return;
            if (lostSet.has(to)) {
              setPendingLostStage(to);
              setPendingWonStage(null);
              setLostReason("");
            } else if (wonSet.has(to)) {
              setPendingWonStage(to);
              setPendingLostStage(null);
              // Default to the saved amount; the field form mirrors every commit onto the card.
              setWonAmount(card.amountCents != null ? (card.amountCents / 100).toString() : "");
            } else {
              setPendingLostStage(null);
              setPendingWonStage(null);
              onChangeStage(card.id, to);
            }
          }}
        >
          {pendingHandoff && <option value="">Accept into stage…</option>}
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {pendingHandoff && (
          <div className="admin-hint u-mt-2">
            Choosing a stage accepts the SDR handoff.
          </div>
        )}
        {pendingLostStage && (
          <div className="u-stack u-mt-2">
            <select
              className="admin-input"
              aria-label="Lost reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            >
              <option value="">Why was this deal lost?</option>
              {LOST_REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <div className="u-row">
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={!lostReason}
                onClick={() => {
                  onChangeStage(card.id, pendingLostStage, { lostReason });
                  setPendingLostStage(null);
                }}
              >
                Mark lost
              </button>
              <button type="button" className="admin-btn" onClick={() => setPendingLostStage(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {pendingWonStage && (
          <div className="u-stack u-mt-2">
            <div className="admin-field">
              <label className="admin-label">Final deal amount ({(card.currency ?? "usd").toUpperCase()})</label>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={wonAmount}
                onChange={(e) => setWonAmount(e.target.value)}
              />
            </div>
            <div className="u-row">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!(Number(wonAmount) > 0)}
                onClick={() => {
                  onChangeStage(card.id, pendingWonStage, { wonAmount: Number(wonAmount) });
                  setPendingWonStage(null);
                }}
              >
                Mark won
              </button>
              <button type="button" className="admin-btn" onClick={() => setPendingWonStage(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!archived && !pendingHandoff && card.status === "open" && card.personId && (
        <div className="u-mb-4">
          <ConfirmButton
            className="admin-btn"
            label="Demote to lead"
            title="Send this deal back to the leads queue?"
            body={
              <>
                <p className="u-mb-2">
                  &quot;{card.title || "This deal"}&quot; moves back to the SDR queue as a lead. The deal is
                  archived, not deleted — restore it any time from the danger zone below.
                </p>
                <input
                  className="admin-input"
                  placeholder="Why? (optional)"
                  value={demoteReason}
                  onChange={(e) => setDemoteReason(e.target.value)}
                />
              </>
            }
            confirmLabel="Demote to lead"
            onConfirm={() => demoteDealToLead(card.id, demoteReason)}
            onDone={() => {
              onPatch({ archivedAt: new Date().toISOString() });
              setDemoteReason("");
              onClose();
            }}
          />
        </div>
      )}
    </>
  );
}
