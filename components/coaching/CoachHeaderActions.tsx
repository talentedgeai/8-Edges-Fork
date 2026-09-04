"use client";

import { useState, useTransition } from "react";
import {
  generatePrepAction,
  logOneOnOne,
  scheduleOneOnOne,
} from "@/app/team/(dashboard)/coaching/actions";

// The header's quick-action cluster: the three things a coach reaches for
// walking into (or out of) a 1-1. Generate prep runs against the next
// scheduled meeting directly; Schedule and Log reveal a small inline form.
// Every button routes through the same server actions the meetings card uses,
// each of which re-asserts coach ownership server-side.

type ActionResult = { ok: true } | { ok: false; error: string };

export function CoachHeaderActions({
  profileId,
  nextMeetingId,
  nextHasPrep,
}: {
  profileId: string;
  nextMeetingId: string | null;
  nextHasPrep: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "schedule" | "log">(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logTranscript, setLogTranscript] = useState("");

  const run = (label: string, fn: () => Promise<ActionResult>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(`${label}: ${res.error}`);
      else done?.();
    });
  };

  const toggle = (p: "schedule" | "log") => {
    setError(null);
    setPanel((cur) => (cur === p ? null : p));
  };

  return (
    <div className="admin-coach-hero__actions">
      <div className="admin-coach-hero__actionbtns">
        {nextMeetingId && (
          <button
            className="admin-btn admin-btn--primary"
            disabled={busy}
            onClick={() => run("Prep", () => generatePrepAction(nextMeetingId))}
          >
            {nextHasPrep ? "Regenerate prep" : "Generate prep"}
          </button>
        )}
        <button className="admin-btn" disabled={busy} onClick={() => toggle("schedule")}>
          {panel === "schedule" ? "Cancel" : "Schedule 1-1"}
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => toggle("log")}>
          {panel === "log" ? "Cancel" : "Log a past 1-1"}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert--err admin-coach-hero__msg">{error}</div>}
      {busy && <div className="admin-hint admin-coach-hero__msg">Working… AI steps can take a minute.</div>}

      {panel === "schedule" && (
        <div className="admin-coach-hero__panel">
          <div className="admin-field">
            <label className="admin-label" htmlFor="hero-schedule-date">
              Next 1-1 date
            </label>
            <input
              id="hero-schedule-date"
              className="admin-input"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy || !scheduleDate}
              onClick={() =>
                run(
                  "Schedule",
                  () => scheduleOneOnOne(profileId, scheduleDate),
                  () => {
                    setPanel(null);
                    setScheduleDate("");
                  },
                )
              }
            >
              Schedule
            </button>
          </div>
        </div>
      )}

      {panel === "log" && (
        <div className="admin-coach-hero__panel">
          <div className="admin-field">
            <label className="admin-label" htmlFor="hero-log-date">
              Meeting date
            </label>
            <input
              id="hero-log-date"
              className="admin-input"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="hero-log-transcript">
              Transcript (optional; the AI drafts both summaries and extracts commitments)
            </label>
            <textarea
              id="hero-log-transcript"
              className="admin-input"
              rows={5}
              value={logTranscript}
              onChange={(e) => setLogTranscript(e.target.value)}
              placeholder="Paste the transcript or your raw notes…"
            />
          </div>
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy || !logDate}
              onClick={() =>
                run(
                  "Log 1-1",
                  () => logOneOnOne(profileId, logDate, logTranscript),
                  () => {
                    setPanel(null);
                    setLogDate("");
                    setLogTranscript("");
                  },
                )
              }
            >
              Log it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
