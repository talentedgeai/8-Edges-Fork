"use client";

import { useState, useTransition } from "react";
import type { RosterCandidate } from "../data/roster";
import { addToRoster } from "@/entities/team/routes/(dashboard)/coaching/actions";

// Add a team member to the actor's own coaching roster. Alternating-week
// setups are just a matter of picking the right first 1-1 date; the biweekly
// cadence takes over from there.
export function AddToRoster({ candidates }: { candidates: RosterCandidate[] }) {
  const [teamMemberId, setTeamMemberId] = useState("");
  const [firstOn, setFirstOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (candidates.length === 0) return null;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Add to your roster</div>
      <div className="admin-hint">
        Pick a person and their first 1-1 date. Biweekly cadence starts from that date, so an
        alternating-week group is just a first date one week offset from the others.
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-coach-add-row">
        <select
          className="admin-input"
          value={teamMemberId}
          onChange={(e) => setTeamMemberId(e.target.value)}
          aria-label="Team member"
        >
          <option value="">Choose a team member…</option>
          {candidates.map((c) => (
            <option key={c.teamMemberId} value={c.teamMemberId}>
              {c.name}
              {c.positionTitle ? ` (${c.positionTitle})` : ""}
            </option>
          ))}
        </select>
        <input
          className="admin-input"
          type="date"
          value={firstOn}
          onChange={(e) => setFirstOn(e.target.value)}
          aria-label="First 1-1 date"
        />
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy || !teamMemberId}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await addToRoster(teamMemberId, firstOn || null);
              if (!res.ok) setError(res.error);
              else {
                setTeamMemberId("");
                setFirstOn("");
              }
            });
          }}
        >
          Add to roster
        </button>
      </div>
    </section>
  );
}
