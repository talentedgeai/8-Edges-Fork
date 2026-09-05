"use client";

import { useState } from "react";
import type { OneOnOne } from "../../data/profile";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { archiveMeeting, generatePrepAction, saveTranscript, setMinutesLink, summarizeAction } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { MeetingSummaries } from "./MeetingSummaries";
import { type ActionResult } from "./shared";
import { formatDate } from "@/kernel/ui/format";

export function MeetingRow({
  m,
  html,
  run,
  busy,
  isNext = false,
}: {
  m: OneOnOne;
  html: { prep: string | null; summary: string | null; shared: string | null } | undefined;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
  isNext?: boolean;
}) {
  const [open, setOpen] = useState(isNext);
  const [transcript, setTranscript] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");

  const published = Boolean(m.sharedPublishedAt);

  const prepBlock = (
    <div className={`coach-block${isNext ? " admin-coach-block--prep" : ""}`}>
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Prep</span>
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run("Prep", () => generatePrepAction(m.id))}>
          {m.prepMarkdown ? "Regenerate" : "Generate prep"}
        </button>
      </div>
      {html?.prep ? (
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.prep }} />
      ) : (
        <div className="admin-cell-muted">No prep yet.</div>
      )}
    </div>
  );

  return (
    <div className={`admin-coach-meeting${isNext ? " admin-coach-meeting--next" : ""}`}>
      <button className="admin-coach-meeting-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <strong>{m.heldOn ? formatDate(m.heldOn) : "-"}</strong>
        {isNext && <span className="admin-badge admin-badge--info admin-coach-meeting-next-tag">Next 1-1</span>}
        <span className={`admin-badge ${m.status === "held" ? "admin-badge--ok" : "admin-badge--info"}`}>
          {m.status}
        </span>
        {m.prepMarkdown && <span className="admin-badge admin-badge--ok">Prep ready</span>}
        {m.modeSplit && (
          <span className="admin-badge admin-badge--info" title="Coach / Mentor / Direct, target 80/15/5">
            {m.modeSplit.coach}/{m.modeSplit.mentor}/{m.modeSplit.direct}
          </span>
        )}
        {m.summaryMarkdown && (
          <span className={`admin-badge ${published ? "admin-badge--ok" : "admin-badge--warn"}`}>
            {published ? "Recap published" : "Recap draft"}
          </span>
        )}
        {m.aiError && <span className="admin-badge admin-badge--err">AI error</span>}
        <span className="admin-coach-meeting-caret">
          {m.prepMarkdown ? (open ? "Hide prep ▾" : "View prep ▸") : open ? "Close ▾" : "Open ▸"}
        </span>
      </button>

      {open && (
        <div className="admin-coach-meeting-body">
          {m.aiError && <div className="admin-alert admin-alert--err">AI: {m.aiError}</div>}

          {isNext && prepBlock}

          {/* Mode split — generated from the transcript when the 1-1 is
              analyzed, never entered by hand. Shown only once it exists. */}
          {m.modeSplit && (
            <div className="coach-block">
              <div className="admin-coach-block-head">
                <span className="admin-eyebrow">Mode split, from the transcript (target 80/15/5)</span>
              </div>
              <div className="admin-cell-muted">
                {m.modeSplit.coach}% coach · {m.modeSplit.mentor}% mentor · {m.modeSplit.direct}% direct
              </div>
            </div>
          )}

          {/* Lark Minutes link */}
          <div className="coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Lark Minutes</span>
            </div>
            {m.minutesToken ? (
              <a
                href={`https://edge8company.sg.larksuite.com/minutes/${m.minutesToken}`}
                target="_blank"
                rel="noreferrer"
                className="admin-cell-muted"
              >
                Recording linked ({m.transcriptSource === "minutes_auto" ? "auto-detected" : "linked"}): open in Lark ↗
              </a>
            ) : (
              <div className="admin-coach-add-row">
                <input
                  className="admin-input"
                  placeholder="Paste the Lark Minutes link…"
                  value={minutesUrl}
                  onChange={(e) => setMinutesUrl(e.target.value)}
                />
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={busy || !minutesUrl.trim()}
                  onClick={() => {
                    run("Minutes link", () => setMinutesLink(m.id, minutesUrl));
                    setMinutesUrl("");
                  }}
                >
                  Link
                </button>
              </div>
            )}
          </div>

          {/* Prep — first in the body on the next 1-1, where it is the thing
              you came for; below the logging blocks on past ones. */}
          {!isNext && prepBlock}

          {/* Transcript */}
          <div className="coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Transcript</span>
            </div>
            {m.transcript ? (
              <details>
                <summary className="admin-cell-muted">
                  {m.transcript.length.toLocaleString()} characters: view
                </summary>
                <pre className="admin-coach-transcript">{m.transcript}</pre>
              </details>
            ) : (
              <>
                <textarea
                  className="admin-input"
                  rows={5}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the transcript. The AI drafts both summaries and extracts commitments."
                />
                <div className="admin-form-actions">
                  <button
                    className="admin-btn"
                    disabled={busy || !transcript.trim()}
                    onClick={() => run("Transcript", () => saveTranscript(m.id, transcript))}
                  >
                    Save &amp; summarize
                  </button>
                </div>
              </>
            )}
            {m.transcript && !m.summaryMarkdown && (
              <div className="admin-form-actions">
                <button className="admin-btn" disabled={busy} onClick={() => run("Summary", () => summarizeAction(m.id))}>
                  Summarize transcript
                </button>
              </div>
            )}
          </div>

          <MeetingSummaries m={m} html={html} run={run} busy={busy} />

          <div className="coach-block admin-coach-block--danger">
            <ConfirmButton
              label="Archive this 1-1"
              className="admin-btn admin-btn--sm admin-btn--danger"
              title="Archive this 1-1?"
              body="It disappears from both views."
              confirmLabel="Archive"
              disabled={busy}
              onConfirm={() => archiveMeeting(m.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
