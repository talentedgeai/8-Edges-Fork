"use client";

import { useEffect, type ReactNode } from "react";

export function DetailDrawer({
  open,
  onClose,
  title,
  eyebrow,
  action,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  // Optional control rendered in the header, left of the close button —
  // e.g. an "open full page" link when the shelf is a summary of a record
  // that has its own route.
  action?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock the page behind the drawer so a swipe that reaches the drawer's scroll
    // end does not scroll the list underneath (paired with overscroll-behavior on
    // .admin-drawer-body). Restored on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer" role="dialog" aria-modal="true">
        <div className="admin-drawer-head">
          <div>
            {eyebrow && <div className="admin-drawer-eyebrow">{eyebrow}</div>}
            <div className="admin-drawer-title">{title}</div>
          </div>
          <div className="admin-drawer-actions">
            {action}
            <button className="admin-drawer-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="admin-drawer-body">{children}</div>
      </aside>
    </>
  );
}
