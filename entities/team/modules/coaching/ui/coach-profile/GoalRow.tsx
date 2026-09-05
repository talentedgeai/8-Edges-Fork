"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "../../data/profile";
import type { CoachingGoal, GoalStatus } from "../../types";
import { GOAL_STATUS_LABELS } from "@/entities/team/modules/coaching/types";
import { LadderSelect } from "../LadderSelect";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { ladderValue, parseLadder } from "@/entities/team/modules/coaching/ladder";
import { deleteGoal, updateGoal } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { GoalComments } from "@/entities/team/modules/coaching/ui/GoalComments";
import { type ActionResult } from "./shared";
import { LadderBadge } from "./LadderBadge";

export function GoalRow({
  g,
  detail,
  run,
  busy,
}: {
  g: CoachingGoal;
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [ladder, setLadder] = useState(ladderValue(g.ladder));
  return (
    <div className="admin-coach-commitment">
      <div className="admin-coach-commitment-main">
        <span className={`admin-badge ${g.status === "active" ? "admin-badge--ok" : "admin-badge--warn"}`}>
          {GOAL_STATUS_LABELS[g.status]}
        </span>
        <span className="admin-coach-commitment-title">{g.title}</span>
        <LadderBadge ladder={g.ladder} />
      </div>
      <div className="admin-coach-commitment-controls">
        <select
          className="admin-input"
          value={g.status}
          disabled={busy}
          onChange={(e) =>
            run("Goal", () => updateGoal(detail.profileId, g.id, { status: e.target.value as GoalStatus }))
          }
        >
          {Object.entries(GOAL_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <LadderSelect
          edges={detail.edges}
          value={ladder}
          disabled={busy}
          onChange={(v) => {
            setLadder(v);
            run("Goal ladder", () => updateGoal(detail.profileId, g.id, { ladder: parseLadder(v) }));
          }}
        />
        <ConfirmButton
          label="Delete"
          className="admin-btn admin-btn--sm admin-btn--danger"
          title="Delete this FAST goal?"
          body="Its comments go with it."
          confirmLabel="Delete"
          disabled={busy}
          onConfirm={() => deleteGoal(detail.profileId, g.id)}
        />
      </div>
      <GoalComments goalId={g.id} comments={g.comments} />
    </div>
  );
}
