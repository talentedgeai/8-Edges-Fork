"use client";

import { useEffect, useState } from "react";

type PromptResult = { ok: true; prompt: string } | { ok: false; error: string };
type SubmitResult = { ok: boolean; error?: string };

// The regenerate dialog: it fetches the assembled prompt, lets the operator edit
// it, and sends the exact text back on Generate. Shared by image and text.
export function RegenerateModal({
  title,
  footnote,
  builtFrom,
  loadPrompt,
  onSubmit,
  onClose,
}: {
  title: string;
  footnote: string;
  builtFrom: string;
  loadPrompt: () => Promise<PromptResult>;
  onSubmit: (prompt: string) => Promise<SubmitResult>;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    let live = true;
    loadPrompt().then((r) => {
      if (!live) return;
      if (r.ok) setPrompt(r.prompt);
      else setSeedError(r.error);
      setLoading(false);
    });
    return () => {
      live = false;
    };
    // loadPrompt is stable for the modal's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function generate() {
    if (prompt == null) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(prompt);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error ?? "Generation failed.");
  }

  return (
    <div className="admin-campaign-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="admin-campaign-modal-card">
        <div className="admin-campaign-modal-head">
          <span className="admin-campaign-modal-title">{title}</span>
          <button type="button" className="admin-btn admin-btn--sm" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div className="admin-campaign-modal-body">
          {loading ? (
            <div className="admin-hint">Loading the prompt…</div>
          ) : seedError ? (
            <div className="admin-alert admin-alert--err">{seedError}</div>
          ) : (
            <>
              <label className="admin-label u-block u-mb-2">
                Prompt to be used — edit before running
              </label>
              <textarea
                className="admin-textarea"
                rows={12}
                value={prompt ?? ""}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy}
              />

              <details className="admin-card u-mt-3 u-p-3" open={showSources} onToggle={(e) => setShowSources((e.target as HTMLDetailsElement).open)}>
                <summary className="u-strong u-pointer">Built from</summary>
                <div className="admin-hint u-mt-2">{builtFrom}</div>
              </details>

              {error && (
                <div className="admin-alert admin-alert--err u-mt-3">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="admin-campaign-modal-foot">
          <span className="admin-hint">{footnote}</span>
          <div className="u-row">
            <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={generate}
              disabled={busy || loading || !!seedError || !(prompt ?? "").trim()}
            >
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
