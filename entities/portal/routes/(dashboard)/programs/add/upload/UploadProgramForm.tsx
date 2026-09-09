"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadProgramAction, recordDocumentAction, signedUploadAction } from "../../actions";
import { formatBytes } from "@/kernel/ui/format";
import { putToSignedUrl } from "@/kernel/ui/upload";

type CompanyOption = { companyId: string; companyName: string };

type QueueItem = {
  id: number;
  file: File;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

// Files PUT straight to Supabase Storage via the one-shot signed URL, so the
// bytes never pass through the serverless function (Vercel caps bodies ~4.5MB).
export function UploadProgramForm({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.companyId ?? "");
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    setQueue((q) => [
      ...files.map((file) => ({ id: nextId.current++, file, progress: 0, status: "queued" as const })),
      ...q,
    ]);
  }

  function removeItem(id: number) {
    setQueue((q) => q.filter((it) => it.id !== id));
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Give your program a name.");
      return;
    }
    const pending = queue.filter((it) => it.status === "queued" || it.status === "error");
    if (pending.length === 0) {
      setError("Add at least one document.");
      return;
    }

    setBusy(true);
    const created = await createUploadProgramAction({ companyId: companyId || undefined, name: name.trim() });
    if (!created.ok) {
      setError(created.error);
      setBusy(false);
      return;
    }
    const { programId } = created;

    for (const it of pending) {
      update(it.id, { status: "uploading", progress: 0, error: undefined });
      const signed = await signedUploadAction({ programId, filename: it.file.name });
      if (!signed.ok) {
        update(it.id, { status: "error", error: signed.error });
        continue;
      }
      const put = await putToSignedUrl(signed.signedUrl, it.file, (p) => update(it.id, { progress: p }));
      if (!put.ok) {
        update(it.id, { status: "error", error: put.error });
        continue;
      }
      const rec = await recordDocumentAction({
        programId,
        path: signed.path,
        filename: it.file.name,
        sizeBytes: it.file.size,
      });
      update(it.id, rec.ok ? { status: "done", progress: 1 } : { status: "error", error: rec.error });
    }

    setBusy(false);
    // Head to the program: any failed files can be retried there later.
    router.push(`/portal/programs/${programId}`);
  }

  return (
    <div className="u-max-form">
      <label className="admin-label" htmlFor="program-name">Program name</label>
      <input
        id="program-name"
        className="admin-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sales enablement AI program"
        disabled={busy}
      />

      {companies.length > 1 && (
        <div className="u-mt-4">
          <label className="admin-label" htmlFor="program-company">Company</label>
          <select
            id="program-company"
            className="admin-select"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={busy}
          >
            {companies.map((c) => (
              <option key={c.companyId} value={c.companyId}>{c.companyName}</option>
            ))}
          </select>
        </div>
      )}

      <div className="u-mt-4">
        <label className="admin-label">Documents</label>
        <div
          className={`admin-gallery-drop${drag ? " is-drag" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <span className="admin-gallery-drop-ico" aria-hidden>⬆</span>
          <span className="admin-gallery-drop-title">Drag files here, or click to browse</span>
          <span className="admin-gallery-drop-sub">PDF, Word, slides, spreadsheets, text · up to 25 MB each</span>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="admin-list u-mt-4">
          {queue.map((it) => (
            <div className="admin-list-row" key={it.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{it.file.name}</div>
                <div className="admin-list-sub">
                  {it.status === "error" ? (
                    <span className="u-err">{it.error}</span>
                  ) : it.status === "uploading" ? (
                    `Uploading… ${Math.round(it.progress * 100)}%`
                  ) : it.status === "done" ? (
                    "Uploaded"
                  ) : (
                    formatBytes(it.file.size)
                  )}
                </div>
              </div>
              <div className="admin-list-aside">
                {it.status === "done" ? (
                  <span aria-hidden>✓</span>
                ) : it.status === "queued" ? (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => removeItem(it.id)} disabled={busy}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="admin-alert admin-alert--err u-mt-4">{error}</div>}

      <div className="u-row u-mt-4">
        <button type="button" className="admin-btn admin-btn--primary" onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create program"}
        </button>
      </div>
    </div>
  );
}
