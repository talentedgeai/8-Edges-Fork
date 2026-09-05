"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "../../data/profile";
import type { RetentionRoot } from "../../types";
import { RETENTION_ROOT_LABELS } from "@/entities/team/modules/coaching/types";
import { setCadence, setRetentionRoot } from "@/entities/team/routes/(dashboard)/coaching/actions";
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
      </div>
    </section>
  );
}
