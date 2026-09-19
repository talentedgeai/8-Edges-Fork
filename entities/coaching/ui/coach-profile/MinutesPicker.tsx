"use client";

import { useState } from "react";
import { attachMinutes, listRecentMinutesForCoach } from "@/entities/coaching/lib/minutes-actions";
import { type ActionResult } from "./shared";
import { formatDate } from "@/kernel/ui/format";

type Minute = { token: string; title: string | null; startTime: string | null };

// Attach a Lark Minutes recording by hand (K.10). The auto-match reads the
// member's first name out of the title and misses whenever the title is
// phrased differently, so the coach needs a way to say which recording this
// was. The list is loaded on demand, not with the page: most rows never need
// it, and the Lark call is slow enough to be worth avoiding.
export function MinutesPicker({
  meetingId,
  run,
  busy,
}: {
  meetingId: string;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [minutes, setMinutes] = useState<Minute[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");

  if (minutes === null) {
    return (
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy || loading}
          onClick={async () => {
            setLoading(true);
            try {
              setMinutes(await listRecentMinutesForCoach());
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Loading recordings…" : "Attach Lark Minutes"}
        </button>
      </div>
    );
  }

  if (minutes.length === 0) {
    return <div className="admin-cell-muted">No Lark Minutes in the last 14 days. Paste the link instead.</div>;
  }

  return (
    <div className="admin-coach-add-row">
      <select className="admin-input" value={token} onChange={(e) => setToken(e.target.value)}>
        <option value="">Pick a recording…</option>
        {minutes.map((m) => (
          <option key={m.token} value={m.token}>
            {m.startTime ? `${formatDate(m.startTime.slice(0, 10))} · ` : ""}
            {m.title || "Untitled recording"}
          </option>
        ))}
      </select>
      <button
        className="admin-btn admin-btn--sm"
        disabled={busy || !token}
        onClick={() => {
          run("Attach Minutes", () => attachMinutes(meetingId, token));
          setToken("");
        }}
      >
        Attach
      </button>
    </div>
  );
}
