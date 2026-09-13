"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { RetentionRoot } from "@/entities/coaching/lib/types";
import { RETENTION_ROOT_LABELS } from "@/entities/coaching/lib/types";
import { setCadence, setOneOnOnesPaused, setRetentionRoot } from "@/entities/coaching/lib/actions";
import { type ActionResult } from "./shared";

export function CadenceCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [cadence, setCadenceDays] = useState(String(detail.cadenceDays));
  const [nextOn, setNextOn] = useState(detail.nextOneOnOneOn ?? "");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Cadence &amp; retention read</div>
      <div className="admin-coach-field-row">
        <div className="admin-field">
          <label className="admin-label" htmlFor="cadence-days">
            Cadence (days)
          </label>
          <input
            id="cadence-days"
            className="admin-input"
            type="number"
            min={7}
            max={90}
            value={cadence}
            onChange={(e) => setCadenceDays(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="next-on">
            Next 1-1
          </label>
          <input
            id="next-on"
            className="admin-input"
            type="date"
            value={nextOn}
            onChange={(e) => setNextOn(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="retention-root">
            Loose engagement root (only you see this)
          </label>
          <select
            id="retention-root"
            className="admin-input"
            value={detail.retentionRoot ?? ""}
            disabled={busy}
            onChange={(e) =>
              run("Retention", () =>
                setRetentionRoot(detail.profileId, (e.target.value || null) as RetentionRoot | null),
              )
            }
          >
            <option value="">-</option>
            {Object.entries(RETENTION_ROOT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy}
          onClick={() => run("Cadence", () => setCadence(detail.profileId, Number(cadence), nextOn || null))}
        >
          Save cadence
        </button>
        <button
          className="admin-btn"
          disabled={busy}
          onClick={() =>
            run(detail.oneOnOnesPausedAt ? "Resume 1-1s" : "Pause 1-1s", () =>
              setOneOnOnesPaused(detail.profileId, !detail.oneOnOnesPausedAt),
            )
          }
        >
          {detail.oneOnOnesPausedAt ? "Resume 1-1s" : "Pause 1-1s"}
        </button>
        <span className="admin-hint u-m-0">
          {detail.oneOnOnesPausedAt
            ? "Paused: no next date is rolled and no prep is written until you resume."
            : "The next 1-1 rolls forward by the cadence on its own; pause to stop it."}
        </span>
      </div>
    </section>
  );
}
