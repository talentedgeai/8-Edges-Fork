"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GOAL_STATUS_LABELS, type EdgesOptions, type GoalStatus } from "@/lib/coaching/data";
import { LadderSelect } from "@/components/coaching/LadderSelect";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { parseLadder } from "@/lib/coaching/ladder";
import { addMyGoal, deleteMyGoal, updateMyGoal } from "./actions";

// One goal as the panel needs it. Mirrors CoachingGoal minus the coach-tier
// fields (comments, ladder detail) the member page does not edit.
export type MyGoalRow = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  ladderLabel: string | null;
  // The company goal this ladders to, as the picker encodes it ("kind:id"),
  // or "" for a goal that stands on its own.
  ladderValue: string;
  // False for goals someone else set for you: editable, but not yours to delete.
  canDelete: boolean;
};

type FormState = {
  title: string;
  description: string;
  status: GoalStatus;
  quarterLabel: string;
  metricUnit: string;
  startValue: string;
  targetValue: string;
  currentValue: string;
  dueDate: string;
  ladder: string;
};

const STATUSES: GoalStatus[] = ["draft", "active", "achieved", "dropped"];

function emptyForm(quarter: string): FormState {
  return {
    title: "",
    description: "",
    status: "active",
    quarterLabel: quarter,
    metricUnit: "",
    startValue: "",
    targetValue: "",
    currentValue: "",
    dueDate: "",
    ladder: "",
  };
}

function formOf(g: MyGoalRow): FormState {
  const str = (v: number | null) => (v === null ? "" : String(v));
  return {
    title: g.title,
    description: g.descriptionMarkdown ?? "",
    status: g.status,
    quarterLabel: g.quarterLabel ?? "",
    metricUnit: g.metricUnit ?? "",
    startValue: str(g.startValue),
    targetValue: str(g.targetValue),
    currentValue: str(g.currentValue),
    dueDate: g.dueDate ?? "",
    ladder: g.ladderValue,
  };
}

// "" stays null rather than becoming 0 — a blank measure is "not tracked",
// not "zero".
const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Progress from start (or 0) to target. Null whenever there is no target to
// measure against, so a goal without a number simply shows no bar.
function progressPct(g: MyGoalRow): number | null {
  if (g.targetValue === null || g.currentValue === null) return null;
  const from = g.startValue ?? 0;
  const span = g.targetValue - from;
  if (span === 0) return null;
  const pct = ((g.currentValue - from) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function measureText(g: MyGoalRow): string | null {
  const unit = g.metricUnit ? ` ${g.metricUnit}` : "";
  const parts: string[] = [];
  if (g.currentValue !== null) parts.push(`now ${g.currentValue}${unit}`);
  if (g.targetValue !== null) parts.push(`target ${g.targetValue}${unit}`);
  if (g.dueDate) parts.push(`by ${fmtDate(g.dueDate)}`);
  return parts.length ? parts.join(" · ") : null;
}

export function MyGoalsPanel({
  rows,
  quarter,
  edges,
}: {
  rows: MyGoalRow[];
  quarter: string;
  edges: EdgesOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // null = the add form is closed; a goal id = that row is being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(quarter));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(quarter));
    setAdding(true);
    setBanner(null);
  }

  function openEdit(g: MyGoalRow) {
    setAdding(false);
    setEditingId(g.id);
    setForm(formOf(g));
    setBanner(null);
  }

  function close() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm(quarter));
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: okText });
        close();
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      title: form.title,
      descriptionMarkdown: form.description,
      status: form.status,
      quarterLabel: form.quarterLabel,
      metricUnit: form.metricUnit,
      startValue: numOrNull(form.startValue),
      targetValue: numOrNull(form.targetValue),
      currentValue: numOrNull(form.currentValue),
      dueDate: form.dueDate,
      ladder: parseLadder(form.ladder),
    };
    if (editingId) {
      run(() => updateMyGoal(editingId, input), "Goal updated. Your manager has been notified.");
    } else {
      run(() => addMyGoal(input), "Goal added. Your manager has been notified.");
    }
  }

  const goalForm = (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-field">
        <label className="admin-label" htmlFor="goal-title">The goal</label>
        <input
          id="goal-title"
          className="admin-input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Days to hire under 20 days"
          maxLength={200}
          required
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="goal-desc">What success looks like (optional)</label>
        <textarea
          id="goal-desc"
          className="admin-textarea"
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Ambitious enough to stretch, specific enough that we both know when it's hit."
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="goal-ladder">Aligns to a company goal</label>
        <LadderSelect
          id="goal-ladder"
          edges={edges}
          value={form.ladder}
          onChange={(v) => set("ladder", v)}
          disabled={pending}
          emptyLabel="Choose the company goal this serves…"
          required
        />
      </div>

      <div className="admin-goals-grid">
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-unit">Measure (optional)</label>
          <input
            id="goal-unit"
            className="admin-input"
            value={form.metricUnit}
            onChange={(e) => set("metricUnit", e.target.value)}
            placeholder="days, clients, %"
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-start">Starting at</label>
          <input
            id="goal-start"
            className="admin-input"
            type="number"
            step="any"
            value={form.startValue}
            onChange={(e) => set("startValue", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-current">Where I am now</label>
          <input
            id="goal-current"
            className="admin-input"
            type="number"
            step="any"
            value={form.currentValue}
            onChange={(e) => set("currentValue", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-target">Target</label>
          <input
            id="goal-target"
            className="admin-input"
            type="number"
            step="any"
            value={form.targetValue}
            onChange={(e) => set("targetValue", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-due">By when</label>
          <input
            id="goal-due"
            className="admin-input"
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-cycle">Cycle</label>
          <input
            id="goal-cycle"
            className="admin-input"
            value={form.quarterLabel}
            onChange={(e) => set("quarterLabel", e.target.value)}
            placeholder={quarter}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="goal-status">Status</label>
          <select
            id="goal-status"
            className="admin-select"
            value={form.status}
            onChange={(e) => set("status", e.target.value as GoalStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{GOAL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Saving…" : editingId ? "Save goal" : "Add goal"}
        </button>
        <button type="button" className="admin-btn" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div>
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>
          {banner.text}
        </div>
      )}

      {adding ? (
        <div className="admin-card admin-section-card u-mb-5">
          <h2 className="admin-card-title">Add a FAST goal</h2>
          {goalForm}
        </div>
      ) : (
        <div className="admin-form-actions u-mb-5">
          <button className="admin-btn admin-btn--primary" onClick={openAdd} disabled={pending}>
            Add a goal
          </button>
        </div>
      )}

      {rows.length === 0 && !adding && (
        <div className="admin-empty">
          No goals yet. Add one, and it lands with your manager and in your next 1-1.
        </div>
      )}

      {rows.map((g) => {
        const pct = progressPct(g);
        const measure = measureText(g);
        return (
          <div key={g.id} className="admin-card admin-section-card admin-goals-card">
            {editingId === g.id ? (
              <>
                <h2 className="admin-card-title">Edit goal</h2>
                {goalForm}
              </>
            ) : (
              <>
                <div className="admin-goals-card-head">
                  <strong>{g.title}</strong>
                  <span
                    className={`admin-badge ${
                      g.status === "achieved"
                        ? "admin-badge--ok"
                        : g.status === "active"
                          ? "admin-badge--info"
                          : "admin-badge--warn"
                    }`}
                  >
                    {GOAL_STATUS_LABELS[g.status]}
                  </span>
                  {g.quarterLabel && <span className="admin-cell-muted">{g.quarterLabel}</span>}
                </div>

                {g.descriptionMarkdown && <p className="admin-cell-muted">{g.descriptionMarkdown}</p>}
                {measure && <div className="admin-cell-muted">{measure}</div>}
                {pct !== null && (
                  <div className="admin-goals-bar" aria-label={`${pct}% of target`}>
                    <span style={{ width: `${pct}%` }} /* layout-ok: data-driven width */ />
                  </div>
                )}
                {g.ladderLabel && (
                  <div className="admin-cell-muted">Aligns to: {g.ladderLabel}</div>
                )}

                <div className="admin-form-actions">
                  <button className="admin-btn admin-btn--sm" onClick={() => openEdit(g)} disabled={pending}>
                    Edit
                  </button>
                  {g.canDelete ? (
                    <ConfirmButton
                      label="Delete"
                      className="admin-btn admin-btn--sm"
                      title={`Delete "${g.title}"?`}
                      body="Your manager is notified."
                      confirmLabel="Delete"
                      disabled={pending}
                      onConfirm={() => deleteMyGoal(g.id)}
                      onDone={() => {
                        setBanner({ tone: "ok", text: "Goal deleted. Your manager has been notified." });
                        router.refresh();
                      }}
                    />
                  ) : (
                    <span className="admin-cell-muted">Set for you, so only they can delete it</span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
