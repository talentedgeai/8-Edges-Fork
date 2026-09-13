"use client";

import { useState } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { archiveDeal, deleteDeal, restoreDeal } from "./actions";
import type { DealCard } from "./types";

// Archive, restore and hard-delete for one deal. Split out of DealDetail (Q3).
export function DealDangerZone({ card, onPatch, onRemove, onClose }: {
  card: DealCard;
  onPatch: (patch: Partial<DealCard>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const archived = !!card.archivedAt;
  const [restoreErr, setRestoreErr] = useState<string | null>(null);

  return (
    <>
      <div className="admin-danger-zone u-mt-4">
        <div className="admin-danger-zone-title">Danger zone</div>
        {archived ? (
          <div className="admin-danger-row">
            <span className="admin-danger-row-text">
              This deal is archived and hidden from the board.
              {restoreErr && <div className="admin-alert admin-alert--err u-mt-2">{restoreErr}</div>}
            </span>
            <button
              type="button"
              className="admin-btn"
              onClick={async () => {
                const r = await restoreDeal(card.id);
                if (r.ok) onPatch({ archivedAt: null });
                else setRestoreErr(r.error);
              }}
            >
              Restore
            </button>
          </div>
        ) : (
          <div className="admin-danger-row">
            <span className="admin-danger-row-text">
              Archive hides this deal from the board and forecast but keeps the record. Reversible.
            </span>
            <ConfirmButton
              className="admin-btn"
              label="Archive"
              title="Archive this deal?"
              body={`"${card.title || "This deal"}" will be hidden from the board. You can restore it any time.`}
              confirmLabel="Archive"
              onConfirm={() => archiveDeal(card.id)}
              onDone={() => {
                onPatch({ archivedAt: new Date().toISOString() });
                onClose();
              }}
            />
          </div>
        )}
        <div className="admin-danger-row">
          <span className="admin-danger-row-text">
            Permanently delete this deal. Cannot be undone, and is blocked if it has linked inquiries or projects.
          </span>
          <ConfirmButton
            label="Delete permanently"
            title="Permanently delete this deal?"
            body={
              <>
                This deletes <strong>{card.title || "this deal"}</strong>. This cannot be undone.
              </>
            }
            confirmLabel="Delete permanently"
            onConfirm={() => deleteDeal(card.id)}
            onDone={() => {
              onRemove();
              onClose();
            }}
          />
        </div>
      </div>
    </>
  );
}
