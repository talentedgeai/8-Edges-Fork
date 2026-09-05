"use client";

import type { CoachProfileDetail } from "../../data/profile";
import { resolveTalkingPoint } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { type ActionResult } from "./shared";

export function TalkingPointsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  if (detail.talkingPoints.length === 0) {
    return (
      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">
          Their talking points <span className="admin-cell-muted">what {detail.member.name} wants to cover</span>
        </div>
        <div className="admin-empty">
          Nothing raised yet. What {detail.member.name} adds to their agenda on their own page (before the 1-1) shows up
          here and feeds the prep.
        </div>
      </section>
    );
  }
  return (
    <section className="admin-card admin-coach-section admin-coach-carried">
      <div className="admin-card-title">
        Their talking points <span className="admin-cell-muted">what {detail.member.name} wants to cover</span>
      </div>
      <div className="admin-hint">
        Raised for this 1-1, and folded into the prep. Mark addressed once you have covered it.
      </div>
      {detail.talkingPoints.map((t) => (
        <div key={t.id} className="admin-coach-carried-row">
          <span className="admin-coach-carried-title">{t.body}</span>
          <button
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => run("Talking point", () => resolveTalkingPoint(t.id))}
          >
            Mark addressed
          </button>
        </div>
      ))}
    </section>
  );
}
