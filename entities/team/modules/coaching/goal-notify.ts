// Manager + Lark notice on every member-driven FAST goal change (/team/goals).
// Transparent is the T in FAST: adding, editing, or deleting a goal is never a
// silent act. Best effort by construction — the goal is already saved when
// these run, so a Resend or Lark outage must never surface as a failed save.

import type { TeamActor } from "@/kernel/identity/team-auth";
import { getManagerContact } from "@/entities/team/lib/data";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import type { CoachingGoal } from "./types";
import { escapeHtml } from "@/kernel/config/html";

// Where the notice goes when the member has no manager on file (or the manager
// has no email). Never drop the notice: an unmanaged member's goals are exactly
// the ones nobody would otherwise see.
const FALLBACK_EMAIL = "dave@edge8.ai";

export type GoalAction = "added" | "updated" | "deleted";

const VERB: Record<GoalAction, string> = {
  added: "added a FAST goal",
  updated: "updated a FAST goal",
  deleted: "deleted a FAST goal",
};

// Member-authored text lands in a manager's inbox as HTML; escape it.
// "12 clients / target 20 clients, by 30 Sep 2026" — the measure in one line,
// omitting whatever the member left blank.
function measureLine(g: {
  metricUnit: string | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
}): string | null {
  const unit = g.metricUnit ? ` ${g.metricUnit}` : "";
  const parts: string[] = [];
  if (g.currentValue !== null) parts.push(`now ${g.currentValue}${unit}`);
  if (g.targetValue !== null) parts.push(`target ${g.targetValue}${unit}`);
  if (g.dueDate) {
    parts.push(
      `by ${new Date(`${g.dueDate}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`,
    );
  }
  return parts.length ? parts.join(", ") : null;
}

type GoalSummary = Pick<
  CoachingGoal,
  "title" | "status" | "quarterLabel" | "metricUnit" | "targetValue" | "currentValue" | "dueDate"
> & {
  // The company goal it aligns to, already resolved to a label. The caller
  // resolves it server-side (ladderLabelFor) — a client-supplied label would
  // let anyone claim alignment to anything in a manager's inbox.
  ladderLabel: string | null;
};

// Both a saved goal (CoachingGoal) and the input that produced one
// (MyGoalInput) carry these fields, so the delete path can report the row it
// just removed. The ladder label comes in separately: a saved goal has it
// resolved, an input has only the id.
export function summarize(
  g: Omit<GoalSummary, "ladderLabel">,
  ladderLabel: string | null,
): GoalSummary {
  return {
    title: g.title,
    status: g.status,
    quarterLabel: g.quarterLabel,
    metricUnit: g.metricUnit,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    dueDate: g.dueDate,
    ladderLabel,
  };
}

export function notifyGoalChange(
  actor: TeamActor,
  action: GoalAction,
  goal: GoalSummary,
): void {
  const measure = measureLine(goal);
  const cycle = goal.quarterLabel ? ` (${goal.quarterLabel})` : "";

  notifyOps(
    `FAST goal ${action}: ${actor.displayName} — "${goal.title}"${cycle}` +
      `${measure ? ` · ${measure}` : ""} · status ${goal.status}` +
      `${goal.ladderLabel ? ` · aligns to ${goal.ladderLabel}` : ""}.`,
  ).catch(() => {});

  getManagerContact(actor)
    .then((mgr) =>
      sendTransactionalEmail({
        to: mgr?.email ?? FALLBACK_EMAIL,
        subject: `FAST goal ${action}: ${actor.displayName}`,
        html: `
          <p>${escapeHtml(actor.displayName)} ${VERB[action]}${escapeHtml(cycle)}.</p>
          <p><strong>${escapeHtml(goal.title)}</strong></p>
          ${measure ? `<p>${escapeHtml(measure)}</p>` : ""}
          ${goal.ladderLabel ? `<p>Aligns to: ${escapeHtml(goal.ladderLabel)}</p>` : ""}
          <p>Status: ${escapeHtml(goal.status)}</p>
          ${
            action === "deleted"
              ? "<p>The goal has been removed from their list.</p>"
              : "<p>See it in the 8 Edges Team workspace under My Team &gt; Coaching, and talk it through in your next 1-1.</p>"
          }
        `,
        logMeta: { source: "team-fast-goals", action },
      }),
    )
    .catch(() => {});
}
