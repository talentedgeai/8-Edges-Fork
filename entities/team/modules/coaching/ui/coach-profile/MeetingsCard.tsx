"use client";

import type { CoachProfileDetail, OneOnOne } from "../../data/profile";
import { type RenderedHtml, type ActionResult } from "./shared";
import { MeetingRow } from "./MeetingRow";

export function MeetingsCard({
  detail,
  html,
  run,
  busy,
  view,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
  view: "next" | "log";
}) {
  // The next 1-1 = the earliest still-scheduled row. Picked by status and date
  // order alone (no clock), so the server and client agree on which row that is.
  const nextMeetingId =
    detail.meetings
      .filter((m) => m.status === "scheduled")
      .reduce<OneOnOne | null>((earliest, m) => (!earliest || m.heldOn < earliest.heldOn ? m : earliest), null)
      ?.id ?? null;

  // "next" shows only the upcoming 1-1, already open on its prep, the
  // walk-into-the-room view; "log" is the full history. Scheduling and logging
  // live in the header, so this card no longer carries those forms.
  // "next" is the single upcoming 1-1; "log" is the past, so it excludes the
  // still-scheduled (future) meeting entirely.
  const rows =
    view === "next"
      ? detail.meetings.filter((m) => m.id === nextMeetingId)
      : detail.meetings.filter((m) => m.status !== "scheduled");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">{view === "next" ? "Next 1-1" : "1-1 log"}</div>

      {view === "next" && !nextMeetingId && (
        <div className="admin-empty">No upcoming 1-1. Schedule one from the top of the page.</div>
      )}
      {view === "log" && detail.meetings.length === 0 && <div className="admin-empty">No 1-1s yet.</div>}

      {rows.map((m) => (
        <MeetingRow
          key={m.id}
          m={m}
          html={html.meetings[m.id]}
          run={run}
          busy={busy}
          isNext={m.id === nextMeetingId}
        />
      ))}
    </section>
  );
}
