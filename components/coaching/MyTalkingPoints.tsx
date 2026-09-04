"use client";

import { useState, useTransition } from "react";
import type { TalkingPoint } from "@/lib/coaching/data";
import { addMyTalkingPoint, deleteMyTalkingPoint } from "@/app/team/(dashboard)/my-coaching/actions";

// The coachee's half of the 1-1 agenda: what they want to raise next time. The
// coach sees these before the meeting and they feed the AI prep. Members can
// remove only what they wrote.

type ActionResult = { ok: true } | { ok: false; error: string };

export function MyTalkingPoints({
  talkingPoints,
  teamMemberId,
}: {
  talkingPoints: TalkingPoint[];
  teamMemberId: string;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const run = (fn: () => Promise<ActionResult>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else done?.();
    });
  };

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Your talking points <span className="admin-cell-muted">your agenda for the next 1-1</span>
      </div>
      <div className="admin-hint">
        What you want to cover next time. Your coach sees these before the meeting, and they feed the prep, so the 1-1
        is yours to shape too.
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      {talkingPoints.length === 0 && (
        <div className="admin-empty">Nothing yet. Add what&apos;s on your mind for next time.</div>
      )}
      {talkingPoints.map((t) => (
        <div key={t.id} className="admin-coach-carried-row">
          <span className="admin-coach-carried-title">{t.body}</span>
          {t.authorTeamMemberId === teamMemberId && (
            <button
              className="admin-btn admin-btn--sm admin-btn--danger"
              disabled={busy}
              onClick={() => run(() => deleteMyTalkingPoint(t.id))}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="Add a talking point for your next 1-1…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && body.trim()) run(() => addMyTalkingPoint(body), () => setBody(""));
          }}
        />
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy || !body.trim()}
          onClick={() => run(() => addMyTalkingPoint(body), () => setBody(""))}
        >
          Add
        </button>
      </div>
    </section>
  );
}
