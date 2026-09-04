"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeeting } from "@/app/admin/(dashboard)/revenue/meetings/actions";
import { MEETING_ACCEPT } from "@/lib/meeting-extract";
import type { CompanyOption } from "@/lib/admin/meetings";

// Upload a meeting transcript by pasting text OR choosing a file. Lives on the
// Add New page; `defaultCompanyId` preselects the client when arriving from a
// company 360 tab. On submit it creates the row, AI summarization runs
// server-side, and we go straight to the new meeting's Details page, which shows
// "Summarizing…" until the summary lands.
export function MeetingUploadForm({
  companies,
  defaultCompanyId,
}: {
  companies: CompanyOption[];
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    // Only send the input for the active mode so a stale value can't win.
    if (mode === "paste") fd.delete("file");
    else fd.delete("transcript");

    start(async () => {
      const res = await createMeeting(fd);
      if (res.ok) {
        setMsg({ tone: "ok", text: "Uploaded. Summarizing…" });
        router.push(`/admin/revenue/meetings/${res.id}`);
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <form ref={formRef} className="admin-form u-mb-4" onSubmit={handleSubmit}>
      {msg && (
        <div className={`admin-alert ${msg.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>
          {msg.text}
        </div>
      )}

      <div className="admin-field">
        <label className="admin-label" htmlFor="mn-company">Client</label>
        <select
          id="mn-company"
          name="companyId"
          className="admin-input"
          required
          defaultValue={defaultCompanyId ?? ""}
        >
          <option value="" disabled>Choose a client…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="u-row u-wrap">
        <div className="admin-field u-flex-1">
          <label className="admin-label" htmlFor="mn-date">Meeting date</label>
          <input id="mn-date" name="meetingDate" type="date" className="admin-input" />
          <p className="admin-cell-muted u-mt-1">Optional — AI detects it from the transcript.</p>
        </div>
        <div className="admin-field u-flex-2">
          <label className="admin-label" htmlFor="mn-title">Title</label>
          <input id="mn-title" name="title" type="text" className="admin-input" placeholder="Optional — AI will generate" />
        </div>
      </div>

      <div className="admin-field">
        <div className="u-row u-gap-4 u-mb-2">
          <label className="admin-label--check">
            <input type="radio" name="mn-mode" checked={mode === "paste"} onChange={() => setMode("paste")} />
            Paste text
          </label>
          <label className="admin-label--check">
            <input type="radio" name="mn-mode" checked={mode === "file"} onChange={() => setMode("file")} />
            Upload file
          </label>
        </div>

        {mode === "paste" ? (
          <textarea
            name="transcript"
            className="admin-input admin-textarea--grow"
            rows={8}
            placeholder="Paste the meeting transcript here…"
          />
        ) : (
          <>
            <input type="file" name="file" className="admin-input" accept={MEETING_ACCEPT} />
            <p className="admin-cell-muted u-mt-1">
              .txt, .vtt, .srt, .md, or .docx (max 10 MB). For a PDF, paste the text instead.
            </p>
          </>
        )}
      </div>

      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Uploading…" : "Upload & summarize"}
        </button>
      </div>
    </form>
  );
}
