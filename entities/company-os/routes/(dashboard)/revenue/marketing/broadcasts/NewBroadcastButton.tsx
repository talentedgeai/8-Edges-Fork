"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NewBroadcastForm } from "./NewBroadcastForm";

// Creation lives in a modal so the index page is the list, not a list buried
// under a form.
export function NewBroadcastButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        + New broadcast
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="admin-campaign-modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <div className="admin-campaign-modal-card">
              <div className="admin-campaign-modal-head">
                <span className="admin-campaign-modal-title">New broadcast</span>
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <div className="admin-campaign-modal-body">
                <NewBroadcastForm />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
