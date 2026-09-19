"use client";

import { useState, useTransition } from "react";
import type { LeaveSpan } from "@/entities/coaching/lib/leave-window";
import { setMyPreferredSlot } from "@/entities/coaching/lib/my-actions";
import { buildOneOnOneIcs } from "@/entities/coaching/lib/ics";
import { WEEKDAY_NAMES } from "@/entities/coaching/lib/cadence";
import { formatDate } from "@/kernel/ui/format";
import { ProposeDate } from "./ProposeDate";
import { MissedOneOnOne } from "./MissedOneOnOne";

// When 1-1s suit the member (K.34): a weekday and a Saigon time, stated once
// on their own page and read by the coach and the cycle. Beside it, a calendar
// file for the next 1-1. Link-only, like every notification here: the file is
// built in the browser from what the page already knows, and nothing syncs.

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export function PreferredSlot({
  preferredWeekday,
  preferredTime,
  next,
  coachName,
  proposedOn,
  missedOn,
  coachLeave,
  myLeave,
}: {
  preferredWeekday: number | null;
  preferredTime: string | null;
  // The next 1-1 as the page knows it: its date and, when set, its start time.
  next: { heldOn: string; startsAt: string | null } | null;
  coachName: string | null;
  // A date this member has proposed that the coach has not answered (K.32).
  proposedOn: string | null;
  // The day of a 1-1 that was booked and did not happen (K.36); null otherwise.
  missedOn: string | null;
  // Who is away, and when (L.2): the coach's holidays so a proposed day is one
  // they can make, the member's own so a 1-1 missed over one stays quiet.
  coachLeave: LeaveSpan[];
  myLeave: LeaveSpan[];
}) {
  const [weekday, setWeekday] = useState<string>(preferredWeekday === null ? "" : String(preferredWeekday));
  const [time, setTime] = useState<string>(preferredTime ?? "");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setToast(null);
    setError(null);
    startTransition(async () => {
      const res = await setMyPreferredSlot(weekday === "" ? null : Number(weekday), time || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(
        weekday === "" && !time
          ? "Saved. No preference: the rhythm carries on as it is."
          : "Saved. Your coach sees it, and the next dates land on it.",
      );
    });
  };

  const downloadIcs = () => {
    if (!next) return;
    const ics = buildOneOnOneIcs({
      uid: `coaching-1-1-${next.heldOn}@edge8`,
      dateISO: next.heldOn,
      time: next.startsAt,
      title: coachName ? `1-1 with ${coachName}` : "1-1",
      description: "Ninety seconds before: what moved, what is stuck, what to talk about.",
      url: `${window.location.origin}/team/my-coaching?tab=my`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `1-1-${next.heldOn}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Picking the day of the next 1-1 (K.32) sits above the standing
          preference (K.34): one is about the meeting in front of you, the
          other about every meeting after it. */}
      {/* The miss comes first, because "that day went by" is the thing to
          answer before picking another one (K.36). */}
      <MissedOneOnOne missedOn={missedOn} coachName={coachName} myLeave={myLeave} />
      <ProposeDate
        nextOn={next?.heldOn ?? null}
        proposedOn={proposedOn}
        coachName={coachName}
        coachLeave={coachLeave}
        preferredWeekday={preferredWeekday}
      />
      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">When 1-1s suit you</div>
        <div className="admin-hint">
          A day and a time. {coachName ?? "Your coach"} sees it, and when a 1-1 rolls forward it lands on that day.
        </div>
        <div className="admin-coach-field-row">
          <div className="admin-field">
            <label className="admin-label" htmlFor="preferred-weekday">
              Day
            </label>
            <select
              id="preferred-weekday"
              className="admin-input"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
            >
              <option value="">No preference</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="preferred-time">
              Time (Saigon)
            </label>
            <input
              id="preferred-time"
              className="admin-input"
              type="time"
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="admin-form-actions">
          <button type="button" className="admin-btn" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          {next && (
            <button type="button" className="admin-link-btn" onClick={downloadIcs}>
              Add {formatDate(next.heldOn)}
              {next.startsAt ? ` ${next.startsAt}` : ""} to my calendar (.ics)
            </button>
          )}
          {toast && <span className="admin-cell-muted">{toast}</span>}
        </div>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
      </section>
    </>
  );
}
