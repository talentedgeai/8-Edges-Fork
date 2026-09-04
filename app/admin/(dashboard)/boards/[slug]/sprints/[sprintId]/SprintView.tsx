"use client";

// Sprint detail: plan vs actual for one sprint, plus the sprint brief (goal,
// retro takeaways, client-specific meeting summary). Shared by
// /admin/boards/[slug]/sprints/[id] and /team/boards/[slug]/sprints/[id];
// the page wrappers do the authorization, updateSprintBrief re-checks on write.
// "Plan" is deliberately not locked: it is whatever is committed to the sprint
// right now (cards can join mid-sprint), measured in cards and Human Tokens.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/Badge";
import { formatDate } from "@/lib/admin/format";
import { PRIORITY_LABEL, PRIORITY_TONE, initials } from "@/lib/boards/types";
import type { BoardDetail, BoardCard, MeetingOption } from "@/lib/boards/data";
import { updateSprintBrief, setSprintMeeting, pullSprintBriefFromMeeting } from "../../actions";

export function SprintView({
  detail,
  sprintId,
  meetingOptions = [],
}: {
  detail: BoardDetail;
  sprintId: string;
  meetingOptions?: MeetingOption[];
}) {
  const router = useRouter();
  const { board, columns, sprints } = detail;
  const sprint = sprints.find((s) => s.id === sprintId)!;

  const cards = useMemo(() => detail.cards.filter((c) => c.sprint_id === sprintId), [detail.cards, sprintId]);
  const columnName = useMemo(() => new Map(columns.map((c) => [c.id, c.name])), [columns]);

  const [banner, setBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState({
    goal: sprint.goal ?? "",
    focusImprovement: sprint.focus_improvement ?? "",
    goingWell: sprint.going_well ?? "",
    meetingSummary: sprint.meeting_summary ?? "",
  });
  const [meetingPick, setMeetingPick] = useState(sprint.meeting_id ?? "");
  const [pulled, setPulled] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  const attachedMeeting = sprint.meeting_id
    ? meetingOptions.find((m) => m.id === sprint.meeting_id) ?? null
    : null;

  function attachMeeting() {
    setBanner(null);
    startSaving(async () => {
      const r = await setSprintMeeting(sprint.id, meetingPick || null, board.slug);
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }

  // Pulls this client's slice of the attached meeting into the edit form as a
  // draft. Nothing is saved until the user reviews and hits Save.
  function pullFromMeeting() {
    setBanner(null);
    startSaving(async () => {
      const r = await pullSprintBriefFromMeeting(sprint.id);
      if (!r.ok) return setBanner(r.error);
      setBrief((prev) => ({
        goal: r.draft.goal ?? prev.goal,
        focusImprovement: r.draft.focusImprovement ?? prev.focusImprovement,
        goingWell: r.draft.goingWell ?? prev.goingWell,
        meetingSummary: r.draft.meetingSummary ?? prev.meetingSummary,
      }));
      setPulled(true);
      setEditing(true);
    });
  }

  function saveBrief() {
    setBanner(null);
    startSaving(async () => {
      const r = await updateSprintBrief(sprint.id, brief, board.slug);
      if (!r.ok) return setBanner(r.error);
      setEditing(false);
      setPulled(false);
      router.refresh();
    });
  }

  // ── Plan vs actual ────────────────────────────────────────────────────────
  const tokens = (c: BoardCard) => c.human_tokens ?? 0;
  const done = cards.filter((c) => c.status === "done");
  const open = cards.filter((c) => c.status !== "done");
  const plannedHT = cards.reduce((s, c) => s + tokens(c), 0);
  const doneHT = done.reduce((s, c) => s + tokens(c), 0);
  const unestimated = cards.filter((c) => c.human_tokens == null).length;
  const cardPct = cards.length ? Math.round((done.length / cards.length) * 100) : 0;
  const htPct = plannedHT ? Math.round((doneHT / plannedHT) * 100) : 0;

  type PersonLine = { name: string; done: number; total: number; doneHT: number; totalHT: number };
  const byAssignee = useMemo(() => {
    const map = new Map<string, PersonLine>();
    for (const c of cards) {
      const name = c.assignee_name ?? "Unassigned";
      const line = map.get(name) ?? { name, done: 0, total: 0, doneHT: 0, totalHT: 0 };
      line.total += 1;
      line.totalHT += tokens(c);
      if (c.status === "done") {
        line.done += 1;
        line.doneHT += tokens(c);
      }
      map.set(name, line);
    }
    return [...map.values()].sort((a, b) => b.totalHT - a.totalHT || b.total - a.total);
  }, [cards]);

  const bar = (pct: number) => (
    <div className="admin-meter admin-meter--thin">
      <div className="admin-meter-fill" style={{ width: `${Math.min(pct, 100)}%` }} /* layout-ok: data-driven width */ />
    </div>
  );

  // Polished sub-headers for the brief sections: an uppercase accent eyebrow
  // over readable body text, sections separated by hairlines.
  const eyebrow = (text: string) => (
    <div
      className="u-label u-strong u-accent u-mb-2 admin-textarea"
    >
      {text}
    </div>
  );

  const bodyText = (display: string | null, placeholder: string) =>
    display ? (
      <div className="u-lg u-prewrap">{display}</div>
    ) : (
      <div className="admin-cell-muted u-sm">{placeholder}</div>
    );

  const briefInput = (key: keyof typeof brief, placeholder: string, rows = 2) => (
    <textarea
      rows={rows}
      value={brief[key]}
      placeholder={placeholder}
      onChange={(e) => setBrief({ ...brief, [key]: e.target.value })}
    />
  );

  const sectionStyle = { borderTop: "1px solid var(--admin-line)", paddingTop: 14, marginTop: 14 };

  const cardRow = (c: BoardCard) => (
    <div
      key={c.id}
      className="admin-row-divided u-wrap admin-select u-max-5"
    >
      <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
      <span className={`${c.status === "done" ? "admin-cell-muted" : "admin-cell-strong"} u-flex-2`}>
        {c.title}
      </span>
      <span className="admin-cell-muted u-sm">
        {c.board_column_id ? columnName.get(c.board_column_id) ?? "" : ""}
      </span>
      {c.assignee_name && (
        <span className="admin-cell-muted u-sm" title={c.assignee_name}>
          {initials(c.assignee_name)}
        </span>
      )}
      <span className="admin-cell-muted u-sm u-right admin-sprint-ht">
        {c.human_tokens != null ? `${c.human_tokens} HT` : "–"}
      </span>
    </div>
  );

  return (
    <div className="u-stack u-gap-4">
      {banner && <div className="admin-alert admin-alert--err">{banner}</div>}

      <section className="admin-card u-p-4">
        <div className="u-row u-gap-3 u-wrap u-mb-2">
          <h2 className="u-m-0 u-lg">Sprint brief</h2>
          <Badge tone={sprint.status === "active" ? "ok" : "neutral"}>{sprint.status}</Badge>
          {(sprint.starts_on || sprint.ends_on) && (
            <span className="admin-cell-muted u-sm">
              {sprint.starts_on ? formatDate(sprint.starts_on) : "?"} to {sprint.ends_on ? formatDate(sprint.ends_on) : "?"}
            </span>
          )}
          <span className="u-ml-auto">
            {editing ? (
              <span className="u-row">
                <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={saveBrief} disabled={saving}>
                  Save
                </button>
                <button className="admin-btn admin-btn--sm" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="admin-btn admin-btn--sm" onClick={() => setEditing(true)}>
                Edit brief
              </button>
            )}
          </span>
        </div>
        <div className="admin-field">
          <label className="admin-label">Planning meeting</label>
          <div className="u-row u-wrap">
            <select
              value={meetingPick}
              onChange={(e) => setMeetingPick(e.target.value)}
            >
              <option value="">No meeting attached</option>
              {meetingOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.started_at ? ` (${formatDate(m.started_at)})` : ""}
                </option>
              ))}
              {sprint.meeting_id && !attachedMeeting && (
                <option value={sprint.meeting_id}>Currently attached meeting</option>
              )}
            </select>
            {meetingPick !== (sprint.meeting_id ?? "") && (
              <button className="admin-btn admin-btn--sm" onClick={attachMeeting} disabled={saving}>
                {meetingPick ? "Attach" : "Detach"}
              </button>
            )}
            {sprint.meeting_id && meetingPick === (sprint.meeting_id ?? "") && (
              <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={pullFromMeeting} disabled={saving}>
                {saving ? "Reading transcript…" : "Pull notes for this client"}
              </button>
            )}
          </div>
          {pulled && (
            <div className="admin-cell-muted u-sm u-mt-1">
              Draft pulled from the meeting for {board.client_name ?? board.name}. Review the fields below, then Save.
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          {eyebrow("Goal")}
          {editing ? briefInput("goal", "What this sprint is for.") : bodyText(sprint.goal, "What this sprint is for.")}
        </div>

        <div style={sectionStyle}>
          {eyebrow("Going well")}
          {editing
            ? briefInput("goingWell", "Wins worth keeping, from the retrospective.", 3)
            : bodyText(sprint.going_well, "Wins worth keeping, from the retrospective.")}
        </div>

        <div style={sectionStyle}>
          <div className="admin-callout">
            {eyebrow("#1 improvement")}
            {editing ? (
              <>
                {briefInput("focusImprovement", "The one improvement this sprint, from the retrospective.")}
                <div className="admin-cell-muted u-sm u-mt-1">
                  Keep it short. One sentence is ideal.
                </div>
              </>
            ) : (
              bodyText(sprint.focus_improvement, "The one improvement this sprint, from the retrospective.")
            )}
          </div>
        </div>

        <div style={sectionStyle}>
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            aria-expanded={summaryOpen || editing}
            className="admin-btn-reset u-gap-2 admin-row-divided u-wrap"
          >
            {eyebrow("Meeting summary")}
            <span aria-hidden className="u-xs u-accent u-mb-2">
              {summaryOpen || editing ? "▲" : "▼"}
            </span>
            {!(summaryOpen || editing) && sprint.meeting_summary && (
              <span className="admin-cell-muted u-mb-2 u-sm">
                {sprint.meeting_summary.slice(0, 80)}…
              </span>
            )}
          </button>
          {(summaryOpen || editing) &&
            (editing
              ? briefInput("meetingSummary", "Client-specific notes from the planning meeting.", 5)
              : bodyText(sprint.meeting_summary, "Client-specific notes from the planning meeting."))}
        </div>
      </section>

      <section className="admin-card u-p-4">
        <h2 className="u-m-0 u-mb-3 u-lg">Plan vs actual</h2>
        <div className="u-grid-auto-sm u-gap-4">
          <div>
            <div className="admin-label">Cards</div>
            <div className="admin-stat-value">
              {done.length}
              <span className="admin-cell-muted u-lg u-strong"> / {cards.length} done</span>
            </div>
            {bar(cardPct)}
          </div>
          <div>
            <div className="admin-label">Human Tokens</div>
            <div className="admin-stat-value">
              {doneHT}
              <span className="admin-cell-muted u-lg u-strong"> / {plannedHT} delivered</span>
            </div>
            {bar(htPct)}
            {unestimated > 0 && (
              <div className="admin-cell-muted u-sm u-mt-1">
                {unestimated} card{unestimated === 1 ? "" : "s"} without an estimate
              </div>
            )}
          </div>
        </div>

        {byAssignee.length > 0 && (
          <div className="u-mt-4">
            <div className="admin-label">By assignee</div>
            {byAssignee.map((p) => (
              <div
                key={p.name}
                className="admin-row-divided"
              >
                <span className="admin-cell-strong u-flex-1">{p.name}</span>
                <span className="admin-cell-muted u-sm">
                  {p.done}/{p.total} cards
                </span>
                <span className="admin-cell-muted u-sm u-right u-w-120">
                  {p.doneHT}/{p.totalHT} HT
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card u-p-4">
        <h2 className="u-m-0 u-mb-1 u-lg">
          In play <span className="admin-cell-muted u-strong">({open.length})</span>
        </h2>
        {open.length ? open.map(cardRow) : <div className="admin-cell-muted u-sm">Nothing open.</div>}
        <h2 className="u-lg u-m-0 u-mt-4 u-mb-1">
          Done <span className="admin-cell-muted u-strong">({done.length})</span>
        </h2>
        {done.length ? done.map(cardRow) : <div className="admin-cell-muted u-sm">Nothing finished yet.</div>}
      </section>
    </div>
  );
}
