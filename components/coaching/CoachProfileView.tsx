"use client";

import { useState, useTransition } from "react";
import type {
  CoachProfileDetail,
  CoachingGoal,
  CoachingPriority,
  CommitmentStatus,
  EdgesLadder,
  EdgesOptions,
  GoalStatus,
  LadderInput,
  OceanDimensionKey,
  OneOnOne,
  RetentionRoot,
} from "@/lib/coaching/data";
import {
  GOAL_STATUS_LABELS,
  OCEAN_DIMENSIONS,
  OPEN_COMMITMENT_STATUSES,
  RETENTION_ROOT_LABELS,
} from "@/lib/coaching/data";
import { LadderSelect } from "./LadderSelect";
import { ReviewHistoryTable } from "@/components/admin/ReviewHistoryTable";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import type { MemberReviewCycle } from "@/lib/reviews-labels";
import { ladderValue, parseLadder } from "@/lib/coaching/ladder";
import {
  addCommitment,
  addGoal,
  addPriority,
  archiveMeeting,
  deleteGoal,
  generatePrepAction,
  publishOcean,
  publishRecap,
  pushCommitmentToBoard,
  reorderCommitments,
  resolveTalkingPoint,
  runTrendReport,
  saveOcean,
  savePrivateProfile,
  saveSummaries,
  saveTranscript,
  setCadence,
  setMinutesLink,
  setRetentionRoot,
  summarizeAction,
  updateCommitmentStatus,
  updateGoal,
  updatePriority,
} from "@/app/team/(dashboard)/coaching/actions";
import { GoalComments } from "@/components/coaching/GoalComments";
import { CommitmentStack } from "@/components/coaching/CommitmentStack";

// The coach's working surface for one person. Server pre-renders every
// markdown field into `html`; edits round-trip raw markdown through the
// server actions above (each one re-asserts coach ownership server-side).

export type RenderedHtml = {
  meetings: Record<string, { prep: string | null; summary: string | null; shared: string | null }>;
  trends: Record<string, string | null>;
  checkins: Record<string, string | null>;
  privateProfile: string | null;
};

const COACH_TABS = [
  { id: "next", label: "Next 1-1" },
  { id: "log", label: "1-1 Log" },
  { id: "goals", label: "Goals" },
  { id: "person", label: "Person" },
  { id: "performance", label: "Performance" },
  { id: "insights", label: "Insights" },
] as const;

type CoachTab = (typeof COACH_TABS)[number]["id"];

function validTab(raw: string | undefined): CoachTab {
  return COACH_TABS.some((t) => t.id === raw) ? (raw as CoachTab) : "next";
}

type ActionResult = { ok: true } | { ok: false; error: string };

function fmt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CoachProfileView({
  detail,
  html,
  reviews,
  initialTab,
  todayIso,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  // Performance-review cycles for this member (fetched in the page, not in the
  // coaching data layer, so lib/reviews' server deps never reach this bundle).
  reviews: MemberReviewCycle[];
  initialTab?: string;
  todayIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [tab, setTab] = useState<CoachTab>(validTab(initialTab));

  const run = (label: string, fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(`${label}: ${res.error}`);
    });
  };

  // Tab lives in the URL (?tab=…) so links are shareable and refresh keeps the
  // place, without a server round-trip: the server reads the initial tab, and
  // switching only rewrites the query.
  const selectTab = (id: CoachTab) => {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id === "next") url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const counts: Partial<Record<CoachTab, number>> = {
    log: detail.meetings.length,
    goals: detail.goals.filter((g) => g.status === "active").length,
    performance: reviews.length,
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {busy && <div className="admin-hint">Working… AI steps can take a minute.</div>}

      <nav className="admin-tabs coach-tabs" role="tablist" aria-label="Coaching sections">
        {COACH_TABS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`admin-tab${active ? " is-active" : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
              {typeof count === "number" && count > 0 && <span className="admin-coach-tab-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="admin-coach-profile">
        {tab === "next" && (
          <>
            <CarriedOverCard detail={detail} todayIso={todayIso} />
            <TalkingPointsCard detail={detail} run={run} busy={busy} />
            <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="next" />
            <CommitmentsCard detail={detail} run={run} busy={busy} />
            <PrioritiesCard detail={detail} run={run} busy={busy} />
          </>
        )}

        {tab === "log" && <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="log" />}

        {tab === "goals" && (
          <>
            <GoalsCard detail={detail} run={run} busy={busy} />
            <CompanyGoalsCard detail={detail} />
          </>
        )}

        {tab === "person" && (
          <>
            <OceanCard detail={detail} run={run} busy={busy} />
            <NotesCard
              title="Private coaching notes"
              hint="How they're wired plus the retention read. Only you see this. It feeds the AI prep."
              initial={detail.privateProfileMarkdown ?? ""}
              rendered={html.privateProfile}
              onSave={(md) => run("Private notes", () => savePrivateProfile(detail.profileId, md))}
              busy={busy}
            />
            <CadenceCard detail={detail} run={run} busy={busy} />
          </>
        )}

        {tab === "performance" && <PerformanceCard memberName={detail.member.name} reviews={reviews} />}

        {tab === "insights" && (
          <>
            <TrendsCard detail={detail} html={html} run={run} busy={busy} />
            <CheckinsCard detail={detail} html={html} />
          </>
        )}
      </div>
    </div>
  );
}

// ---- Edges ladder picker ----------------------------------------------------
// LadderSelect/ladderValue/parseLadder live in ./LadderSelect, shared with the
// member's own goals page (/team/goals).

function LadderBadge({ ladder }: { ladder: EdgesLadder | null }) {
  if (!ladder) return <span className="admin-cell-muted">no ladder</span>;
  return <span className="admin-cell-muted">⇗ {ladder.label}</span>;
}

// ---- FAST goals (quarterly, team-wide transparent) --------------------------

function GoalsCard({
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

function GoalRow({
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

// ---- priorities (standing 1-1 focus items) ----------------------------------

function PrioritiesCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [detailMd, setDetailMd] = useState("");
  const active = detail.priorities.filter((p) => p.status === "active");
  const retired = detail.priorities.filter((p) => p.status === "retired");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Priorities{" "}
        <span className="admin-cell-muted">(personal growth: what matters most from your view, reviewed every 1-1)</span>
      </div>

      {active.length === 0 && <div className="admin-empty">No standing priorities.</div>}
      {active.map((p) => (
        <div key={p.id} className="admin-coach-commitment">
          <div className="admin-coach-commitment-main">
            <span className="admin-coach-commitment-title">{p.title}</span>
          </div>
          {p.detailMarkdown && <div className="admin-cell-muted admin-coach-priority-detail">{p.detailMarkdown}</div>}
          <div className="admin-coach-commitment-controls">
            <button
              className="admin-btn admin-btn--sm"
              disabled={busy}
              onClick={() => run("Priority", () => updatePriority(detail.profileId, p.id, { status: "retired" }))}
            >
              Retire
            </button>
          </div>
        </div>
      ))}

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="New priority (e.g. P1: Own AI Labs)…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="admin-input"
          placeholder="Detail (optional)…"
          value={detailMd}
          onChange={(e) => setDetailMd(e.target.value)}
        />
        <button
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() => {
            run("Priority", () => addPriority(detail.profileId, title, detailMd, { kind: "none" }));
            setTitle("");
            setDetailMd("");
          }}
        >
          Add
        </button>
      </div>

      {retired.length > 0 && (
        <details className="admin-coach-closed">
          <summary>{retired.length} retired</summary>
          {retired.map((p) => (
            <div key={p.id} className="admin-coach-commitment is-closed">
              <span>{p.title}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

// ---- cadence + retention read -----------------------------------------------

function CadenceCard({
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

// ---- OCEAN profile ----------------------------------------------------------

const OCEAN_LABELS: Record<OceanDimensionKey, string> = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  neuroticism: "Neuroticism",
};

function OceanCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const o = detail.ocean;
  const [editing, setEditing] = useState(false);
  const [dims, setDims] = useState<Record<OceanDimensionKey, { rating: string; evidence: string }>>(() => {
    const init = {} as Record<OceanDimensionKey, { rating: string; evidence: string }>;
    for (const k of OCEAN_DIMENSIONS)
      init[k] = { rating: o?.[k]?.rating ?? "", evidence: o?.[k]?.evidence ?? "" };
    return init;
  });
  const [snapshot, setSnapshot] = useState(o?.snapshotMarkdown ?? "");
  const [guidance, setGuidance] = useState(o?.guidanceMarkdown ?? "");
  const published = Boolean(o?.published);

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-coach-block-head">
        <div className="admin-card-title">OCEAN profile</div>
        <div className="admin-coach-block-actions">
          <span className={`admin-badge ${published ? "admin-badge--ok" : "admin-badge--warn"}`}>
            {published ? "Published: they can read it" : "Draft: only you"}
          </span>
          <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
          {o && (
            <button
              className={`admin-btn admin-btn--sm ${published ? "" : "admin-btn--primary"}`}
              disabled={busy}
              onClick={() => run("OCEAN", () => publishOcean(detail.profileId, !published))}
            >
              {published ? "Unpublish" : "Publish to them"}
            </button>
          )}
        </div>
      </div>
      <div className="admin-hint">
        Ratings with behavioral evidence, a snapshot, and growth guidance written to them in second
        person. They see the full profile once published; discussion happens in the 1-1.
      </div>

      {editing ? (
        <div className="admin-form">
          {OCEAN_DIMENSIONS.map((k) => (
            <div key={k} className="admin-coach-field-row admin-coach-ocean-row">
              <div className="admin-field admin-coach-ocean-rating">
                <label className="admin-label">{OCEAN_LABELS[k]}</label>
                <input
                  className="admin-input"
                  placeholder="High / Medium / Low / TBD…"
                  value={dims[k].rating}
                  onChange={(e) => setDims({ ...dims, [k]: { ...dims[k], rating: e.target.value } })}
                />
              </div>
              <div className="admin-field admin-coach-ocean-evidence">
                <label className="admin-label">Behavioral evidence</label>
                <textarea
                  className="admin-input"
                  rows={2}
                  value={dims[k].evidence}
                  onChange={(e) => setDims({ ...dims, [k]: { ...dims[k], evidence: e.target.value } })}
                />
              </div>
            </div>
          ))}
          <div className="admin-field">
            <label className="admin-label">Personality snapshot</label>
            <textarea className="admin-input" rows={4} value={snapshot} onChange={(e) => setSnapshot(e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label">Growth guidance (second person, written to them)</label>
            <textarea className="admin-input" rows={8} value={guidance} onChange={(e) => setGuidance(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => {
                run("OCEAN", () => saveOcean(detail.profileId, { dims, snapshot, guidance }));
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : o ? (
        <div className="coach-ocean">
          <div className="admin-coach-ocean-list">
            {OCEAN_DIMENSIONS.map((k) => (
              <div key={k} className="admin-coach-ocean-line">
                <div className="admin-coach-ocean-line-head">
                  <strong>{OCEAN_LABELS[k]}</strong>
                  <span className="admin-badge admin-badge--info">{o[k].rating ?? "TBD"}</span>
                </div>
                {o[k].evidence && <div className="admin-cell-muted admin-coach-ocean-line-evidence">{o[k].evidence}</div>}
              </div>
            ))}
          </div>
          {o.snapshotMarkdown && (
            <div className="coach-block">
              <span className="admin-eyebrow">Snapshot</span>
              <p>{o.snapshotMarkdown}</p>
            </div>
          )}
          {o.guidanceMarkdown && (
            <div className="coach-block">
              <span className="admin-eyebrow">Growth guidance (they read this)</span>
              <p className="admin-coach-ocean-guidance">{o.guidanceMarkdown}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-empty">No OCEAN profile yet.</div>
      )}
    </section>
  );
}

// ---- talking points (the member's agenda) -----------------------------------
// What the coachee raised for this 1-1. The member owns the input on their page;
// the coach reads it here and marks each addressed once covered. Hidden when the
// member has raised nothing.

function TalkingPointsCard({
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

// ---- carried over -----------------------------------------------------------
// Open commitments that predate the most recent held 1-1: still open after a
// whole cycle. Overdue first. The same rows also appear in the commitments
// stack below; this is the "don't let it slip" callout at the top of the next
// 1-1. todayIso is server-computed and passed in, so the overdue flag doesn't
// drift between server render and hydration.

function CarriedOverCard({ detail, todayIso }: { detail: CoachProfileDetail; todayIso: string }) {
  const lastHeldOn = detail.meetings
    .filter((m) => m.status === "held")
    .reduce<string | null>((latest, m) => (!latest || m.heldOn > latest ? m.heldOn : latest), null);
  if (!lastHeldOn) return null;

  const carried = detail.commitments
    .filter((c) => (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status))
    .filter((c) => c.createdAt.slice(0, 10) < lastHeldOn)
    .sort((a, b) => {
      const aOverdue = a.dueOn && a.dueOn < todayIso ? 0 : 1;
      const bOverdue = b.dueOn && b.dueOn < todayIso ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.dueOn && b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return a.sortOrder - b.sortOrder;
    });
  if (carried.length === 0) return null;

  return (
    <section className="admin-card admin-coach-section admin-coach-carried">
      <div className="admin-card-title">
        Carried over{" "}
        <span className="admin-cell-muted">still open from before your 1-1 on {fmt(lastHeldOn)}</span>
      </div>
      <div className="admin-hint">
        Close the loop, or carry it forward on purpose. Nothing agreed last time should slip quietly.
      </div>
      {carried.map((c) => {
        const overdue = Boolean(c.dueOn && c.dueOn < todayIso);
        return (
          <div key={c.id} className="admin-coach-carried-row">
            <span className="admin-badge">{c.owner === "coach" ? "me" : "them"}</span>
            <span className="admin-coach-carried-title">{c.title}</span>
            {c.dueOn && (
              <span className={`admin-badge ${overdue ? "admin-badge--warn" : ""}`}>
                {overdue ? "overdue" : "due"} {fmt(c.dueOn)}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---- commitments ------------------------------------------------------------

function CommitmentsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<"member" | "coach">("member");
  const [dueOn, setDueOn] = useState("");
  const openCount = detail.commitments.filter((c) =>
    (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
  ).length;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Commitments <span className="admin-cell-muted">({openCount} open)</span>
      </div>
      <div className="admin-hint">
        What you both said you&apos;d get done before the next 1-1. Drag to reorder; they see the same stack.
      </div>

      <CommitmentStack
        commitments={detail.commitments}
        busy={busy}
        ownerLabel={(c) => (c.owner === "coach" ? "me" : "them")}
        onStatus={(id, status, note) =>
          run("Commitment", () => updateCommitmentStatus(id, status, note))
        }
        onReorder={(ids) => run("Order", () => reorderCommitments(detail.profileId, ids))}
        boardPush={{
          boards: detail.boards,
          cardFor: (c) => detail.commitmentCards[c.id] ?? null,
          onPush: (id, boardId) => run("Push to board", () => pushCommitmentToBoard(id, boardId, detail.profileId)),
        }}
      />

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="New commitment…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className="admin-input" value={owner} onChange={(e) => setOwner(e.target.value as "member" | "coach")}>
          <option value="member">{detail.member.name}</option>
          <option value="coach">Me</option>
        </select>
        <input className="admin-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        <button
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() => {
            run("Commitment", () => addCommitment(detail.profileId, title, owner, dueOn || null));
            setTitle("");
            setDueOn("");
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}

// ---- 1-1 meetings -----------------------------------------------------------

function MeetingsCard({
  detail,
  html,
  run,
  busy,
  view,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
  view: "next" | "log";
}) {
  // The next 1-1 = the earliest still-scheduled row. Picked by status and date
  // order alone (no clock), so the server and client agree on which row that is.
  const nextMeetingId =
    detail.meetings
      .filter((m) => m.status === "scheduled")
      .reduce<OneOnOne | null>((earliest, m) => (!earliest || m.heldOn < earliest.heldOn ? m : earliest), null)
      ?.id ?? null;

  // "next" shows only the upcoming 1-1, already open on its prep, the
  // walk-into-the-room view; "log" is the full history. Scheduling and logging
  // live in the header, so this card no longer carries those forms.
  // "next" is the single upcoming 1-1; "log" is the past, so it excludes the
  // still-scheduled (future) meeting entirely.
  const rows =
    view === "next"
      ? detail.meetings.filter((m) => m.id === nextMeetingId)
      : detail.meetings.filter((m) => m.status !== "scheduled");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">{view === "next" ? "Next 1-1" : "1-1 log"}</div>

      {view === "next" && !nextMeetingId && (
        <div className="admin-empty">No upcoming 1-1. Schedule one from the top of the page.</div>
      )}
      {view === "log" && detail.meetings.length === 0 && <div className="admin-empty">No 1-1s yet.</div>}

      {rows.map((m) => (
        <MeetingRow
          key={m.id}
          m={m}
          html={html.meetings[m.id]}
          run={run}
          busy={busy}
          isNext={m.id === nextMeetingId}
        />
      ))}
    </section>
  );
}

function MeetingRow({
  m,
  html,
  run,
  busy,
  isNext = false,
}: {
  m: OneOnOne;
  html: { prep: string | null; summary: string | null; shared: string | null } | undefined;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
  isNext?: boolean;
}) {
  const [open, setOpen] = useState(isNext);
  const [editing, setEditing] = useState(false);
  const [privateMd, setPrivateMd] = useState(m.summaryMarkdown ?? "");
  const [sharedMd, setSharedMd] = useState(m.sharedSummaryMarkdown ?? "");
  const [transcript, setTranscript] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");

  const published = Boolean(m.sharedPublishedAt);

  const prepBlock = (
    <div className={`coach-block${isNext ? " admin-coach-block--prep" : ""}`}>
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Prep</span>
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run("Prep", () => generatePrepAction(m.id))}>
          {m.prepMarkdown ? "Regenerate" : "Generate prep"}
        </button>
      </div>
      {html?.prep ? (
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.prep }} />
      ) : (
        <div className="admin-cell-muted">No prep yet.</div>
      )}
    </div>
  );

  return (
    <div className={`admin-coach-meeting${isNext ? " admin-coach-meeting--next" : ""}`}>
      <button className="admin-coach-meeting-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <strong>{fmt(m.heldOn)}</strong>
        {isNext && <span className="admin-badge admin-badge--info admin-coach-meeting-next-tag">Next 1-1</span>}
        <span className={`admin-badge ${m.status === "held" ? "admin-badge--ok" : "admin-badge--info"}`}>
          {m.status}
        </span>
        {m.prepMarkdown && <span className="admin-badge admin-badge--ok">Prep ready</span>}
        {m.modeSplit && (
          <span className="admin-badge admin-badge--info" title="Coach / Mentor / Direct, target 80/15/5">
            {m.modeSplit.coach}/{m.modeSplit.mentor}/{m.modeSplit.direct}
          </span>
        )}
        {m.summaryMarkdown && (
          <span className={`admin-badge ${published ? "admin-badge--ok" : "admin-badge--warn"}`}>
            {published ? "Recap published" : "Recap draft"}
          </span>
        )}
        {m.aiError && <span className="admin-badge admin-badge--err">AI error</span>}
        <span className="admin-coach-meeting-caret">
          {m.prepMarkdown ? (open ? "Hide prep ▾" : "View prep ▸") : open ? "Close ▾" : "Open ▸"}
        </span>
      </button>

      {open && (
        <div className="admin-coach-meeting-body">
          {m.aiError && <div className="admin-alert admin-alert--err">AI: {m.aiError}</div>}

          {isNext && prepBlock}

          {/* Mode split — generated from the transcript when the 1-1 is
              analyzed, never entered by hand. Shown only once it exists. */}
          {m.modeSplit && (
            <div className="coach-block">
              <div className="admin-coach-block-head">
                <span className="admin-eyebrow">Mode split, from the transcript (target 80/15/5)</span>
              </div>
              <div className="admin-cell-muted">
                {m.modeSplit.coach}% coach · {m.modeSplit.mentor}% mentor · {m.modeSplit.direct}% direct
              </div>
            </div>
          )}

          {/* Lark Minutes link */}
          <div className="coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Lark Minutes</span>
            </div>
            {m.minutesToken ? (
              <a
                href={`https://edge8company.sg.larksuite.com/minutes/${m.minutesToken}`}
                target="_blank"
                rel="noreferrer"
                className="admin-cell-muted"
              >
                Recording linked ({m.transcriptSource === "minutes_auto" ? "auto-detected" : "linked"}): open in Lark ↗
              </a>
            ) : (
              <div className="admin-coach-add-row">
                <input
                  className="admin-input"
                  placeholder="Paste the Lark Minutes link…"
                  value={minutesUrl}
                  onChange={(e) => setMinutesUrl(e.target.value)}
                />
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={busy || !minutesUrl.trim()}
                  onClick={() => {
                    run("Minutes link", () => setMinutesLink(m.id, minutesUrl));
                    setMinutesUrl("");
                  }}
                >
                  Link
                </button>
              </div>
            )}
          </div>

          {/* Prep — first in the body on the next 1-1, where it is the thing
              you came for; below the logging blocks on past ones. */}
          {!isNext && prepBlock}

          {/* Transcript */}
          <div className="coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Transcript</span>
            </div>
            {m.transcript ? (
              <details>
                <summary className="admin-cell-muted">
                  {m.transcript.length.toLocaleString()} characters: view
                </summary>
                <pre className="admin-coach-transcript">{m.transcript}</pre>
              </details>
            ) : (
              <>
                <textarea
                  className="admin-input"
                  rows={5}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the transcript. The AI drafts both summaries and extracts commitments."
                />
                <div className="admin-form-actions">
                  <button
                    className="admin-btn"
                    disabled={busy || !transcript.trim()}
                    onClick={() => run("Transcript", () => saveTranscript(m.id, transcript))}
                  >
                    Save &amp; summarize
                  </button>
                </div>
              </>
            )}
            {m.transcript && !m.summaryMarkdown && (
              <div className="admin-form-actions">
                <button className="admin-btn" disabled={busy} onClick={() => run("Summary", () => summarizeAction(m.id))}>
                  Summarize transcript
                </button>
              </div>
            )}
          </div>

          {/* Summaries */}
          {(m.summaryMarkdown || m.sharedSummaryMarkdown) && (
            <div className="coach-block">
              <div className="admin-coach-block-head">
                <span className="admin-eyebrow">Summaries</span>
                <div className="admin-coach-block-actions">
                  <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
                    {editing ? "Cancel edit" : "Edit"}
                  </button>
                  <button
                    className={`admin-btn admin-btn--sm ${published ? "" : "admin-btn--primary"}`}
                    disabled={busy}
                    onClick={() => run("Publish", () => publishRecap(m.id, !published))}
                  >
                    {published ? "Unpublish recap" : "Publish recap to them"}
                  </button>
                </div>
              </div>

              {editing ? (
                <div className="admin-form">
                  <div className="admin-field">
                    <label className="admin-label">Private summary (only you)</label>
                    <textarea
                      className="admin-input"
                      rows={10}
                      value={privateMd}
                      onChange={(e) => setPrivateMd(e.target.value)}
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Shared recap (they see this once published)</label>
                    <textarea
                      className="admin-input"
                      rows={8}
                      value={sharedMd}
                      onChange={(e) => setSharedMd(e.target.value)}
                    />
                  </div>
                  <div className="admin-form-actions">
                    <button
                      className="admin-btn admin-btn--primary"
                      disabled={busy}
                      onClick={() => {
                        run("Summaries", () => saveSummaries(m.id, privateMd, sharedMd));
                        setEditing(false);
                      }}
                    >
                      Save both
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-coach-summaries">
                  <div>
                    <div className="admin-coach-tier-label">Private: only you</div>
                    {html?.summary ? (
                      <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.summary }} />
                    ) : (
                      <div className="admin-cell-muted">No private summary.</div>
                    )}
                  </div>
                  <div>
                    <div className="admin-coach-tier-label">
                      Shared recap: {published ? "published to them" : "draft, they can't see it yet"}
                    </div>
                    {html?.shared ? (
                      <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.shared }} />
                    ) : (
                      <div className="admin-cell-muted">No shared recap.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="coach-block admin-coach-block--danger">
            <ConfirmButton
              label="Archive this 1-1"
              className="admin-btn admin-btn--sm admin-btn--danger"
              title="Archive this 1-1?"
              body="It disappears from both views."
              confirmLabel="Archive"
              disabled={busy}
              onConfirm={() => archiveMeeting(m.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- performance ------------------------------------------------------------

function PerformanceCard({ memberName, reviews }: { memberName: string; reviews: MemberReviewCycle[] }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Performance reviews{" "}
        <span className="admin-cell-muted">system of record</span>
      </div>
      {reviews.length === 0 ? (
        <div className="admin-hint">
          No review cycles yet for {memberName}. Self-assessments and manager reviews appear here
          once opened.
        </div>
      ) : (
        <>
          <div className="admin-hint">
            Every self-assessment and manager review for {memberName}. Open a row to read both sides.
          </div>
          <ReviewHistoryTable cycles={reviews} />
        </>
      )}
    </section>
  );
}

// ---- trends -----------------------------------------------------------------

function TrendsCard({
  detail,
  html,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const summarized = detail.meetings.filter((m) => m.status === "held" && m.summaryMarkdown).length;
  const canRun = summarized >= 2;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Trend report <span className="admin-cell-muted">across the last 3 1-1s</span>
      </div>
      <div className="admin-hint">
        A read across the recent 1-1s: trajectory, recurring themes, follow-through, mode split, and what to coach next.
        Needs at least 2 summarized 1-1s.
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn"
          disabled={busy || !canRun}
          onClick={() => run("Trend report", () => runTrendReport(detail.profileId))}
        >
          Run trend report
        </button>
      </div>
      {detail.trends.length === 0 && (
        <div className="admin-empty">
          {canRun
            ? "No trend report yet. Run one across the last 3 1-1s."
            : "A trend report needs at least 2 summarized 1-1s."}
        </div>
      )}
      {detail.trends.map((t) => (
        <details key={t.id} className="admin-coach-trend">
          <summary>
            <strong>Trend as of {fmt(t.createdAt)}</strong>
            {t.aiError && <span className="admin-badge admin-badge--err">failed</span>}
          </summary>
          {html.trends[t.id] ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.trends[t.id]! }} />
          ) : (
            <div className="admin-cell-muted">{t.aiError ?? "Empty."}</div>
          )}
        </details>
      ))}
    </section>
  );
}

// ---- check-ins --------------------------------------------------------------
// Async mid-cycle pulses (the member answers them between 1-1s). They were
// fetched but never shown on the coach side; here they read alongside trends.

function CheckinsCard({ detail, html }: { detail: CoachProfileDetail; html: RenderedHtml }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Check-ins</div>
      {detail.checkins.length === 0 && (
        <div className="admin-empty">No check-ins yet. Mid-cycle pulses between 1-1s appear here.</div>
      )}
      {detail.checkins.map((c) => (
        <details key={c.id} className="admin-coach-trend">
          <summary>
            <strong>{fmt(c.sentAt)}</strong>
            {!c.respondedAt && <span className="admin-badge admin-badge--warn">awaiting their update</span>}
          </summary>
          {html.checkins[c.id] ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.checkins[c.id]! }} />
          ) : (
            <div className="admin-cell-muted">Empty.</div>
          )}
        </details>
      ))}
    </section>
  );
}

// ---- company goals ----------------------------------------------------------
// The company tree comes straight from 8 Edges (objectives and their KRs),
// so this card always matches /admin/edges/goals. There is no personal
// company-goal layer: the person-level system is FAST goals, full stop.

function CompanyGoalsCard({ detail }: { detail: CoachProfileDetail }) {
  const ladderedIds = new Set(
    [...detail.goals, ...detail.priorities]
      .map((g) => (g.ladder?.kind === "key_result" || g.ladder?.kind === "objective" ? g.ladder.id : null))
      .filter(Boolean) as string[],
  );

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Company goals</div>
      <div className="admin-hint">
        The 8 Edges tree their goals ladder into. Highlighted rows are where {detail.member.name} plugs in.
      </div>
      <div className="admin-coach-okr-tree">
        {detail.edges.objectives.map((o, i) => (
          <div key={o.id} className="admin-coach-okr-objective">
            <div className={`admin-coach-okr-line${ladderedIds.has(o.id) ? " is-laddered" : ""}`}>
              <strong>O{i + 1}</strong> {o.label}
            </div>
            <ul>
              {detail.edges.keyResults
                .filter((k) => k.objectiveId === o.id)
                .map((k, j) => (
                  <li key={k.id} className={`admin-coach-okr-line${ladderedIds.has(k.id) ? " is-laddered" : ""}`}>
                    <span className="admin-cell-muted">KR{j + 1}</span> {k.label}
                    {ladderedIds.has(k.id) && <span className="admin-badge admin-badge--ok">their ladder</span>}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- markdown notes (private profile / company goals) -----------------------

function NotesCard({
  title,
  hint,
  initial,
  rendered,
  onSave,
  busy,
}: {
  title: string;
  hint: string;
  initial: string;
  rendered: string | null;
  onSave: (md: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [md, setMd] = useState(initial);

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-coach-block-head">
        <div className="admin-card-title">{title}</div>
        <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <div className="admin-hint">{hint}</div>
      {editing ? (
        <div className="admin-form">
          <textarea className="admin-input" rows={12} value={md} onChange={(e) => setMd(e.target.value)} />
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => {
                onSave(md);
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : rendered ? (
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: rendered }} />
      ) : (
        <div className="admin-cell-muted">Nothing here yet.</div>
      )}
    </section>
  );
}
