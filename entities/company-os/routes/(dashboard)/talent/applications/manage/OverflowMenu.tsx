"use client";

import { useState } from "react";
import { APPLICATION_STATUS_OPTIONS } from "@/entities/company-os/modules/hiring/application-status";

// The ⋯ overflow: full status control plus archive/restore, kept out of the
// primary action zone. Popover + full-screen click-catcher to dismiss.
export function OverflowMenu({
  status,
  onStatus,
  archived,
  onToggleArchive,
}: {
  status: string;
  onStatus: (v: string) => void;
  archived: boolean;
  onToggleArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-record-iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu" role="menu">
            <div className="admin-section-label u-p-1">
              Set status
            </div>
            {APPLICATION_STATUS_OPTIONS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className="admin-record-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (v !== status) onStatus(v);
                }}
              >
                {v === status ? "✓ " : ""}
                {l}
              </button>
            ))}
            <hr className="admin-hr" />
            <button
              type="button"
              className={`admin-record-menu-item${archived ? "" : " admin-record-menu-item--danger"}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleArchive();
              }}
            >
              {archived ? "Restore to pipeline" : "Archive application"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
