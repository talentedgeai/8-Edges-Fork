"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadDocumentAction } from "../actions";
import { deleteOwnDocumentAction } from "../../documents/actions";
import { formatBytes, formatDate } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// The fields rendered here; both the program's PortalProgramDocument rows and
// the hub's company-wide ClientDocument rows satisfy it.
export type PortalDocumentRow = {
  id: string;
  filename: string;
  url?: string | null; // link rows open the url itself; file rows mint a signed download
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploaderName?: string | null;
  createdAt: string;
};

// The client-facing document list, laid out like the admin hub's Documents
// tab (name, then date · uploader · size). Files open via a short-lived signed
// URL minted server-side (private bucket), so links can't be shared or
// guessed. Delete is uploader-only: the button renders only for your own
// uploads and the server re-checks anyway.
export function ProgramDocuments({
  documents,
  actorEmail,
}: {
  documents: PortalDocumentRow[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myEmail = actorEmail.toLowerCase();

  async function open(id: string) {
    setError(null);
    setBusyId(id);
    const r = await downloadDocumentAction(id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="admin-list">
        {documents.map((d) => {
          const meta = [
            formatDate(d.createdAt),
            d.uploaderName || d.uploadedBy ? `uploaded by ${d.uploaderName ?? d.uploadedBy}` : null,
            d.sizeBytes != null ? formatBytes(d.sizeBytes) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div className="admin-list-row" key={d.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{d.filename}</div>
                <div className="admin-list-sub">{meta}</div>
              </div>
              <div className="admin-list-aside">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--sm">
                    Open
                  </a>
                ) : (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => open(d.id)} disabled={busyId === d.id}>
                    {busyId === d.id ? "…" : "Download"}
                  </button>
                )}
                {(d.uploadedBy ?? "").toLowerCase() === myEmail && (
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title={`Delete "${d.filename}"?`}
                    body="This cannot be undone."
                    confirmLabel="Delete"
                    disabled={busyId === d.id}
                    onConfirm={() => deleteOwnDocumentAction(d.id)}
                    onDone={() => router.refresh()}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
    </div>
  );
}
