"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "../../data/profile";
import { GOAL_STATUS_LABELS } from "@/entities/team/modules/coaching/types";
import { LadderSelect } from "../LadderSelect";
import { parseLadder } from "@/entities/team/modules/coaching/ladder";
import { addGoal } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { type ActionResult } from "./shared";
import { GoalRow } from "./GoalRow";

export function GoalsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [ladder, setLadder] = useState("");
  const current = detail.goals.filter((g) => g.status === "active" || g.status === "draft");
  const past = detail.goals.filter((g) => g.status === "achieved" || g.status === "dropped");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        FAST goals{" "}
        <span className="admin-cell-muted">
          (Frequent · Ambitious · Specific · Transparent: how they&apos;re measured and get promoted, team-visible)
        </span>
      </div>

      {current.length === 0 && <div className="admin-empty">No goals yet. FAST starts with one.</div>}
      {current.map((g) => (
        <GoalRow key={g.id} g={g} detail={detail} run={run} busy={busy} />
      ))}

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="New quarterly goal…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <LadderSelect edges={detail.edges} value={ladder} onChange={setLadder} disabled={busy} />
        <button
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() => {
            run("Goal", () => addGoal(detail.profileId, title, "active", "2026-Q3", parseLadder(ladder)));
            setTitle("");
            setLadder("");
          }}
        >
          Add
        </button>
      </div>

      {past.length > 0 && (
        <details className="admin-coach-closed">
          <summary>{past.length} past goal{past.length === 1 ? "" : "s"}</summary>
          {past.map((g) => (
            <div key={g.id} className="admin-coach-commitment is-closed">
              <span className="admin-badge">{GOAL_STATUS_LABELS[g.status]}</span>
              <span>{g.title}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
