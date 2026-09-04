"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ActionResult = { ok: true } | { ok: false; error: string };

// A danger/secondary button that gates an async action behind a confirm modal.
// For irreversible actions (GDPR erasure) pass `typeToConfirm` — the confirm
// button stays disabled until the operator types that exact string.
export function ConfirmButton({
  label,
  children,
  className = "admin-btn admin-btn--danger",
  title,
  body,
  confirmLabel = "Confirm",
  typeToConfirm,
  disabled,
  onConfirm,
  onDone,
}: {
  label?: string;
  children?: ReactNode;
  className?: string;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  disabled?: boolean;
  onConfirm: () => Promise<ActionResult>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) close();
    };
    document.addEventListener("keydown", onKey);
    (typeToConfirm ? inputRef.current : confirmRef.current)?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending, typeToConfirm]);

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  const matched = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  async function run() {
    if (!matched || pending) return;
    setPending(true);
    setError(null);
    const r = await onConfirm();
    setPending(false);
    if (r.ok) {
      close();
      onDone?.();
    } else {
      setError(r.error);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children ?? label}
      </button>

      {open && (
        <div className="admin-modal-backdrop" onClick={() => !pending && close()}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-title">{title}</div>
            <div className="admin-modal-body">{body}</div>

            {typeToConfirm && (
              <input
                ref={inputRef}
                className="admin-input"
                style={{ marginTop: 12 }}
                placeholder={`Type "${typeToConfirm}" to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") run();
                }}
                aria-label={`Type ${typeToConfirm} to confirm`}
              />
            )}

            {error && (
              <div className="admin-alert admin-alert--err" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}

            <div className="admin-modal-actions">
              <button type="button" className="admin-btn" onClick={close} disabled={pending}>
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={run}
                disabled={!matched || pending}
              >
                {pending ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
