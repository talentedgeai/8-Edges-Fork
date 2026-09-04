"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, humanize, timeAgo } from "@/lib/admin/format";
import { Badge, statusTone } from "@/components/admin/Badge";
import { PersonSelect } from "@/components/admin/PersonSelect";
import { Expandable } from "@/components/admin/Expandable";
import {
  EditableDate,
  EditableLink,
  EditableSelect,
  EditableText,
  EditableTextarea,
  type InlineSaveResult,
} from "@/components/admin/InlineEdit";
import { APPLICATION_STATUS_OPTIONS } from "@/lib/admin/application-status";
import { APPLICATION_SOURCE_OPTIONS, POOL_STATUS_OPTIONS } from "@/lib/admin/recruiting-options";
import { COUNTRIES } from "@/lib/admin/countries";
import type { PersonOption } from "@/lib/admin/people-options";
import { InterviewRounds } from "./InterviewRounds";
import {
  addApplicationNote,
  archiveApplication,
  getApplicationExtras,
  getApplicationNotes,
  getApplicationStages,
  unarchiveApplication,
  updateApplicantProfile,
  updateApplication,
  uploadApplicationResume,
  type AppNote,
  type ApplicationExtras,
  type StageOption,
} from "./actions";

export type AppManageData = {
  id: string;
  jobReqId: string | null;
  personId: string | null;
  jobReqTitle: string | null;
  candidateName: string | null;
  status: string | null;
  rating: number | null;
  rejectionReason: string | null;
  currentStageId: string | null;
  currentStageName: string | null;
  appliedAt: string | null;
  decidedAt: string | null;
  // sourcing (writes applications)
  source: string | null;
  sourceDetail: string | null;
  referrerId: string | null;
  resumeDocumentId: string | null;
  // person-side profile (edits write to people)
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  headline: string | null;
  currentTitle: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  doNotHire: boolean;
  poolStatus: string | null;
  // recruiter's own assessment for this application (writes applications)
  hrAssessment: string | null;
  // recruiter overrides for the AI-extracted fields (write candidate_profile)
  englishProficiency: string | null;
  noticePeriod: string | null;
  // Salary is super-admin-only (Dave + Mai). These are populated from the
  // restricted candidate_sensitive store ONLY when canViewSalary is true;
  // otherwise they are null and the UI hides the salary row entirely.
  canViewSalary: boolean;
  salaryExpectationCents: number | null;
  salaryExpectationCurrency: string | null;
  aiSalary: string | null;
};

// A stored timestamp -> the YYYY-MM-DD a <input type="date"> expects. The org
// operates in Vietnam, so read the instant as its Ho Chi Minh calendar day; a
// plain UTC slice shows the wrong day for timestamps near midnight. The fixed
// timezone also keeps SSR and client hydration in agreement.
const APP_TZ = "Asia/Ho_Chi_Minh";
const toDateInput = (v: string | null): string => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const ok = (): InlineSaveResult => ({ ok: true });

// Collapsed height shared by the AI screen and the HR assessment, so the two
// paired reads clamp to the same fixed height with a Show more toggle.
const AI_COLLAPSED_HEIGHT = 232;

// The whole recruiter workspace for one application: a sticky decision header, a
// clickable pipeline strip, and a two-pane body (what you read to judge on the
// left; the candidate's facts, read-first and editable in place, on the right).
// The data model is unchanged — every edit drives the same server actions the old
// form did; only the surface changed.
export function ApplicationManage({
  app,
  referrerOptions,
  archived,
  stageEnteredAt,
}: {
  app: AppManageData;
  referrerOptions: PersonOption[];
  archived: boolean;
  stageEnteredAt: string | null;
}) {
  const router = useRouter();

  const [stages, setStages] = useState<StageOption[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [extras, setExtras] = useState<ApplicationExtras | null>(null);

  // Header-owned state (things the header shows and acts on). The rail owns its
  // own fields independently and never collides with these.
  const [stageId, setStageId] = useState(app.currentStageId ?? "");
  const [status, setStatus] = useState(app.status ?? "active");
  const [rating, setRating] = useState<number | null>(app.rating);
  const [rejectionReason, setRejectionReason] = useState(app.rejectionReason ?? "");
  const [isArchived, setIsArchived] = useState(archived);
  const [headErr, setHeadErr] = useState<string | null>(null);

  // Load this req's ordered hiring stages (drives the strip + Advance).
  useEffect(() => {
    if (!app.jobReqId) {
      setStagesLoading(false);
      return;
    }
    let live = true;
    setStagesLoading(true);
    getApplicationStages(app.jobReqId).then((r) => {
      if (!live) return;
      if (r.ok) setStages(r.stages);
      setStagesLoading(false);
    });
    return () => {
      live = false;
    };
  }, [app.jobReqId]);

  // Cover letter, answers, and the AI screen are large columns kept out of the
  // list payload; load them once the page mounts.
  useEffect(() => {
    let live = true;
    setExtras(null);
    getApplicationExtras(app.id).then((r) => {
      if (!live) return;
      if (r.ok) setExtras(r.extras);
    });
    return () => {
      live = false;
    };
  }, [app.id]);

  const currentIdx = stageId ? stages.findIndex((s) => s.id === stageId) : -1;
  // Next stage for the Advance button. Genuinely unstaged -> the first stage.
  // A stage set but missing from the loaded list (reconfigured on the req) -> no
  // safe advance, rather than silently moving the candidate back to stage one.
  const nextStage: StageOption | null = !stages.length
    ? null
    : !stageId
      ? stages[0] ?? null
      : currentIdx < 0
        ? null
        : (stages[currentIdx + 1] ?? null);

  async function moveToStage(next: StageOption) {
    const prev = stageId;
    setStageId(next.id);
    setHeadErr(null);
    const r = await updateApplication(app.id, { current_stage_id: next.id });
    if (!r.ok) {
      setStageId(prev);
      setHeadErr(r.error);
      return;
    }
    // A terminal stage auto-stamps decided_at server-side; refresh so the strip,
    // the rail's Decided field, and the pipeline all reflect the move.
    router.refresh();
  }

  async function saveRating(v: number | null) {
    const prev = rating;
    setRating(v);
    setHeadErr(null);
    const r = await updateApplication(app.id, { rating: v });
    if (!r.ok) {
      setRating(prev);
      setHeadErr(r.error);
    }
  }

  async function saveStatus(next: string) {
    const prev = status;
    setStatus(next);
    setHeadErr(null);
    const r = await updateApplication(app.id, { status: next });
    if (!r.ok) {
      setStatus(prev);
      setHeadErr(r.error);
    }
  }

  async function doReject(reason: string): Promise<boolean> {
    const prevStatus = status;
    const prevReason = rejectionReason;
    setStatus("rejected");
    setRejectionReason(reason.trim());
    setHeadErr(null);
    const r = await updateApplication(app.id, {
      status: "rejected",
      rejection_reason: reason.trim() || null,
    });
    if (!r.ok) {
      setStatus(prevStatus);
      setRejectionReason(prevReason);
      setHeadErr(r.error);
      return false;
    }
    return true;
  }

  async function saveRejectionReason(v: string): Promise<InlineSaveResult> {
    const r = await updateApplication(app.id, { rejection_reason: v.trim() || null });
    if (r.ok) setRejectionReason(v.trim());
    return r.ok ? ok() : r;
  }

  async function toggleArchive() {
    setHeadErr(null);
    if (isArchived) {
      const r = await unarchiveApplication(app.id);
      if (!r.ok) return setHeadErr(r.error);
      setIsArchived(false);
      router.refresh();
    } else {
      const r = await archiveApplication(app.id);
      if (!r.ok) return setHeadErr(r.error);
      // Archiving drops it from the pipeline; send the recruiter back to the list.
      router.push("/admin/talent/applications");
    }
  }

  return (
    <>
      <DecisionHeader
        name={app.candidateName || "Candidate"}
        jobReqTitle={app.jobReqTitle}
        source={app.source}
        stageName={stageId ? (stages.find((s) => s.id === stageId)?.name ?? app.currentStageName) : app.currentStageName}
        status={status}
        rating={rating}
        onRate={saveRating}
        onStatus={saveStatus}
        onReject={doReject}
        rejectionReason={rejectionReason}
        onRejectionReason={saveRejectionReason}
        nextStage={nextStage}
        advanceDisabled={!app.jobReqId || stagesLoading || !nextStage}
        onAdvance={() => nextStage && moveToStage(nextStage)}
        archived={isArchived}
        onToggleArchive={toggleArchive}
        error={headErr}
      />

      {app.jobReqId && (
        <PipelineStrip
          stages={stages}
          loading={stagesLoading}
          stageId={stageId}
          stageEnteredAt={stageEnteredAt}
          appliedAt={app.appliedAt}
          onMove={moveToStage}
        />
      )}

      {isArchived && (
        <div className="admin-alert admin-alert--outlined u-mb-4">
          This application is archived and hidden from the pipeline. Use the ⋯ menu to restore it.
        </div>
      )}

      <div className="admin-record-cols">
        <div className="admin-record-main">
          {extras && <AiScreenCard extras={extras} resumeDocumentId={app.resumeDocumentId} />}

          {/* The human read sits right under the machine read — AI screen, then
              your assessment — as a paired judgment in the main column. */}
          <AssessmentCard appId={app.id} hrAssessment={app.hrAssessment} />

          <section className="admin-card admin-section-card">
            <InterviewRounds applicationId={app.id} />
          </section>

          <FeedbackThread applicationId={app.id} />

          {extras && (extras.coverLetter || extras.answers.length > 0) && (
            <CoverLetterCard extras={extras} />
          )}
        </div>

        <aside className="admin-record-rail">
          {app.personId ? (
            <ContactCard
              personId={app.personId}
              email={app.email}
              phone={app.phone}
              city={app.city}
              country={app.country}
              linkedinUrl={app.linkedinUrl}
              portfolioUrl={app.portfolioUrl}
              headline={app.headline}
              currentTitle={app.currentTitle}
            />
          ) : (
            <section className="admin-card admin-section-card">
              <div className="admin-section-label u-mb-2">Contact</div>
              <div className="admin-hint">No linked person record.</div>
            </section>
          )}

          <SourcingCard
            appId={app.id}
            source={app.source}
            sourceDetail={app.sourceDetail}
            referrerId={app.referrerId}
            referrerOptions={referrerOptions}
            appliedAt={app.appliedAt}
            decidedAt={app.decidedAt}
            resumeDocumentId={app.resumeDocumentId}
          />

          {app.personId && (
            <SignalsCard
              personId={app.personId}
              englishProficiency={app.englishProficiency}
              canViewSalary={app.canViewSalary}
              salaryExpectationCents={app.salaryExpectationCents}
              salaryExpectationCurrency={app.salaryExpectationCurrency}
              noticePeriod={app.noticePeriod}
              poolStatus={app.poolStatus}
              doNotHire={app.doNotHire}
              aiEnglish={extras?.aiSummary?.english ?? null}
              aiSalary={app.aiSalary}
              aiNotice={extras?.aiSummary?.notice_period ?? null}
            />
          )}
        </aside>
      </div>
    </>
  );
}

// ─── Decision header ─────────────────────────────────────────────────────────

function DecisionHeader(props: {
  name: string;
  jobReqTitle: string | null;
  source: string | null;
  stageName: string | null;
  status: string;
  rating: number | null;
  onRate: (v: number | null) => void;
  onStatus: (v: string) => void;
  onReject: (reason: string) => Promise<boolean>;
  rejectionReason: string;
  onRejectionReason: (v: string) => Promise<InlineSaveResult>;
  nextStage: StageOption | null;
  advanceDisabled: boolean;
  onAdvance: () => void;
  archived: boolean;
  onToggleArchive: () => void;
  error: string | null;
}) {
  return (
    <div className="admin-record-head">
      <div className="admin-record-head-crumb">
        <Link href="/admin/talent/applications">← Applications</Link>
      </div>
      <div className="admin-record-head-row">
        <div className="admin-record-head-id">
          <h1 className="admin-record-head-title">
            <span>{props.name}</span>
            {(() => {
              // Stage and status are different axes, but on a terminal stage they
              // read the same word (both "Rejected"/"Hired"). Show one badge then,
              // toned by the status; otherwise show the stage and, if not active,
              // the status.
              const statusLabel = humanize(props.status);
              const showStatus = props.status !== "active";
              const dup = props.stageName != null && showStatus && props.stageName.toLowerCase() === statusLabel.toLowerCase();
              return (
                <>
                  {props.stageName && !dup && <Badge tone="info">{props.stageName}</Badge>}
                  {showStatus && <Badge tone={statusTone(props.status)}>{statusLabel}</Badge>}
                </>
              );
            })()}
            <HeaderStars value={props.rating} onChange={props.onRate} />
          </h1>
          <div className="admin-record-head-meta">
            {props.jobReqTitle ? <strong>{props.jobReqTitle}</strong> : "No job req"}
            {props.source ? ` · ${humanize(props.source)}` : ""}
          </div>
          {props.status === "rejected" && (
            <div className="admin-record-head-meta u-mt-1">
              Reason:{" "}
              <EditableText
                value={props.rejectionReason}
                onSave={props.onRejectionReason}
                placeholder="Add a reason…"
                ariaLabel="Rejection reason"
              />
            </div>
          )}
        </div>
        <div className="admin-record-head-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--sm"
            disabled={props.advanceDisabled}
            onClick={props.onAdvance}
            title={props.nextStage ? `Move to ${props.nextStage.name}` : "No next stage"}
          >
            {props.nextStage ? `Advance to ${props.nextStage.name}` : "Advance"}
          </button>
          <RejectControl onReject={props.onReject} disabled={props.status === "rejected"} />
          <OverflowMenu
            status={props.status}
            onStatus={props.onStatus}
            archived={props.archived}
            onToggleArchive={props.onToggleArchive}
          />
        </div>
      </div>
      {props.error && (
        <div className="admin-alert admin-alert--err u-mt-3">
          {props.error}
        </div>
      )}
    </div>
  );
}

// Reject with a reason: the button reveals an inline reason field so the decision
// and its justification are captured together.
function RejectControl({ onReject, disabled }: { onReject: (reason: string) => Promise<boolean>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (disabled) return null;

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setOpen(true)}>
        Reject…
      </button>
    );
  }
  return (
    <span className="u-row">
      <input
        className="admin-input u-w-200"
        autoFocus
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setReason("");
          }
        }}
      />
      <button
        type="button"
        className="admin-btn admin-btn--danger admin-btn--sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const okd = await onReject(reason);
          setBusy(false);
          if (okd) {
            setOpen(false);
            setReason("");
          }
        }}
      >
        {busy ? "Rejecting…" : "Confirm reject"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

// The ⋯ overflow: full status control plus archive/restore, kept out of the
// primary action zone. Popover + full-screen click-catcher to dismiss.
function OverflowMenu({
  status,
  onStatus,
  archived,
  onToggleArchive,
}: {
  status: string;
  onStatus: (v: string) => void;
  archived: boolean;
  onToggleArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-record-iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu" role="menu">
            <div className="admin-section-label u-p-1">
              Set status
            </div>
            {APPLICATION_STATUS_OPTIONS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className="admin-record-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (v !== status) onStatus(v);
                }}
              >
                {v === status ? "✓ " : ""}
                {l}
              </button>
            ))}
            <hr className="admin-hr" />
            <button
              type="button"
              className={`admin-record-menu-item${archived ? "" : " admin-record-menu-item--danger"}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleArchive();
              }}
            >
              {archived ? "Restore to pipeline" : "Archive application"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Compact 1–5 stars for the header. Clicking the current rating clears it.
function HeaderStars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="u-row u-gap-1" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value != null && n <= value}
          onClick={() => onChange(value === n ? null : n)}
          className={`admin-star-btn admin-star-btn--sm${value != null && n <= value ? " is-on" : ""}`}
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

// ─── Pipeline strip ──────────────────────────────────────────────────────────

function PipelineStrip({
  stages,
  loading,
  stageId,
  stageEnteredAt,
  appliedAt,
  onMove,
}: {
  stages: StageOption[];
  loading: boolean;
  stageId: string;
  stageEnteredAt: string | null;
  appliedAt: string | null;
  onMove: (s: StageOption) => void;
}) {
  // Age is time-relative, so compute it after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (loading) {
    return (
      <div className="admin-record-pipe">
        <span className="admin-cell-muted">Loading stages…</span>
      </div>
    );
  }
  if (!stages.length) return null;

  // Terminal stages (Hired / Rejected) are parallel outcomes, not sequential
  // steps. Show only the current terminal one, so a rejected candidate doesn't
  // render "Hired" as a completed step sitting before "Rejected".
  const shown = stages.filter((s) => !s.isTerminal || s.id === stageId);
  const currentIdx = shown.findIndex((s) => s.id === stageId);

  function ageLabel(): string | null {
    if (!mounted) return null;
    if (stageEnteredAt) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000));
      return days === 0 ? "today" : `${days}d in stage`;
    }
    if (appliedAt) return `applied ${timeAgo(appliedAt)}`;
    return null;
  }

  return (
    <div className="admin-record-pipe" role="list" aria-label="Hiring stages">
      {shown.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const age = state === "now" ? ageLabel() : null;
        return (
          <div key={s.id} className={`admin-record-step admin-record-step--${state}`} role="listitem">
            <button
              type="button"
              className="admin-record-step-hit"
              onClick={() => onMove(s)}
              title={`Move to ${s.name}`}
            >
              <span className="admin-record-step-node">{state === "done" ? "✓" : i + 1}</span>
              <span className="admin-record-step-label">
                {s.name}
                {s.isTerminal ? " (final)" : ""}
                {age && <span className="admin-record-step-sub">{age}</span>}
              </span>
            </button>
            {i < shown.length - 1 && <span className="admin-record-step-bar" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main column cards ───────────────────────────────────────────────────────

// The AI screen: score, overview, and extracted skills. Read-only; the recruiter
// overrides its English/salary/notice values in the Signals rail, not here.
function AiScreenCard({ extras, resumeDocumentId }: { extras: ApplicationExtras; resumeDocumentId: string | null }) {
  if (!extras.aiStatus && !extras.aiSummary) return null;
  const s = extras.aiSummary;
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-row u-gap-3 u-between u-mb-3">
        <span>AI screen</span>
        <span className="u-row u-gap-3 u-label">
          {extras.aiScreenedAt && <span className="admin-cell-muted">{formatDate(extras.aiScreenedAt)}</span>}
          {resumeDocumentId && (
            <a href={`/admin/talent/resume/${resumeDocumentId}`} target="_blank" rel="noreferrer">
              Resume ↗
            </a>
          )}
        </span>
      </div>
      {extras.aiStatus === "failed" && extras.aiError && (
        <div className="admin-alert admin-alert--err">Scan failed: {extras.aiError}</div>
      )}
      {extras.aiStatus === "pending" && <div className="admin-hint">Screen in progress…</div>}
      {s ? (
        <div className="u-stack u-gap-3">
          {extras.aiRating != null && (
            <div className="admin-record-ai-score">
              {extras.aiRating}
              <span>/5</span>
            </div>
          )}
          <Expandable collapsedHeight={AI_COLLAPSED_HEIGHT}>
          <div className="u-stack u-gap-3">
          <div className="u-ink-2 u-prewrap u-max-prose">{s.overview}</div>
          {s.skills.length > 0 && (
            <ul className="admin-record-ai-points">
              {s.skills.map((sk, j) => {
                // The model writes many points as "Label: detail" — bold the label.
                // These are full sentences, not tags, so they wrap as a list. Tint
                // each by sentiment (strength vs concern) to echo the screen chips.
                const c = sk.indexOf(": ");
                const label = c > 0 && c < 48 ? sk.slice(0, c) : null;
                const neg = /\b(gaps?|concerns?|risks?|no |not |lack|limited|missing|weak|inconsisten|unclear|reliab|however|but )/i.test(
                  label ?? sk,
                );
                return (
                  <li key={j} className={`admin-record-ai-point admin-record-ai-point--${neg ? "neg" : "pos"}`}>
                    {label ? (
                      <>
                        <strong>{label}:</strong>
                        {sk.slice(c + 1)}
                      </>
                    ) : (
                      sk
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
          </Expandable>
        </div>
      ) : (
        extras.aiStatus !== "failed" && extras.aiStatus !== "pending" && <div className="admin-hint">No screen result yet.</div>
      )}
    </section>
  );
}

function CoverLetterCard({ extras }: { extras: ApplicationExtras }) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Application</div>
      {extras.coverLetter && (
        <details open className={extras.answers.length ? "u-mb-3" : undefined}>
          <summary className="u-mb-2 u-strong u-pointer">Cover letter</summary>
          <div className="u-pl-3 admin-quote u-ink-2 u-prewrap u-max-prose">
            {extras.coverLetter}
          </div>
        </details>
      )}
      {extras.answers.map((x, i) => (
        <div key={i} className="u-mb-3">
          <div className="admin-label u-mb-2">{x.q}</div>
          <div className="u-pl-3 admin-quote u-ink-2 u-prewrap u-max-prose">
            {x.a || "—"}
          </div>
        </div>
      ))}
    </section>
  );
}

// ─── Rail cards ──────────────────────────────────────────────────────────────

function ContactCard(props: {
  personId: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  headline: string | null;
  currentTitle: string | null;
}) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Contact</div>
      <dl className="admin-kv admin-kv--editable">
        <dt>Headline</dt>
        <dd>
          <EditableText value={props.headline ?? ""} placeholder="Add a headline…" ariaLabel="Headline"
            onSave={(v) => updateApplicantProfile(props.personId, { headline: v.trim() || null })} />
        </dd>
        <dt>Title</dt>
        <dd>
          <EditableText value={props.currentTitle ?? ""} placeholder="Current title…" ariaLabel="Current title"
            onSave={(v) => updateApplicantProfile(props.personId, { current_title: v.trim() || null })} />
        </dd>
        <dt>Email</dt>
        <dd>
          <EditableText type="email" value={props.email ?? ""} placeholder="Add email…" ariaLabel="Email"
            onSave={(v) => updateApplicantProfile(props.personId, { email: v.trim() || null })} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <EditableText type="tel" value={props.phone ?? ""} placeholder="Add phone…" ariaLabel="Phone"
            onSave={(v) => updateApplicantProfile(props.personId, { phone: v.trim() || null })} />
        </dd>
        <dt>City</dt>
        <dd>
          <EditableText value={props.city ?? ""} placeholder="Add city…" ariaLabel="City"
            onSave={(v) => updateApplicantProfile(props.personId, { city: v.trim() || null })} />
        </dd>
        <dt>Country</dt>
        <dd>
          <EditableSelect value={props.country ?? ""} placeholder="—" ariaLabel="Country"
            options={COUNTRIES.map((c) => ({ value: c, label: c }))}
            onSave={(v) => updateApplicantProfile(props.personId, { country: v || null })} />
        </dd>
        <dt>LinkedIn</dt>
        <dd>
          <EditableLink value={props.linkedinUrl ?? ""} placeholder="Add LinkedIn…" ariaLabel="LinkedIn"
            onSave={(v) => updateApplicantProfile(props.personId, { linkedin_url: v.trim() || null })} />
        </dd>
        <dt>Portfolio</dt>
        <dd>
          <EditableLink value={props.portfolioUrl ?? ""} placeholder="Add portfolio…" ariaLabel="Portfolio"
            onSave={(v) => updateApplicantProfile(props.personId, { portfolio_url: v.trim() || null })} />
        </dd>
      </dl>
    </section>
  );
}

function SourcingCard(props: {
  appId: string;
  source: string | null;
  sourceDetail: string | null;
  referrerId: string | null;
  referrerOptions: PersonOption[];
  appliedAt: string | null;
  decidedAt: string | null;
  resumeDocumentId: string | null;
}) {
  const [referrerId, setReferrerId] = useState(props.referrerId ?? "");
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Sourcing</div>
      <dl className="admin-kv admin-kv--editable">
        <dt>Source</dt>
        <dd>
          <EditableSelect value={props.source ?? ""} placeholder="—" ariaLabel="Source"
            options={APPLICATION_SOURCE_OPTIONS.map(([v, l]) => ({ value: v, label: l }))}
            onSave={(v) => updateApplication(props.appId, { source: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Detail</dt>
        <dd>
          <EditableText value={props.sourceDetail ?? ""} placeholder="Board, event, who sourced…" ariaLabel="Source detail"
            onSave={(v) => updateApplication(props.appId, { source_detail: v.trim() || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Referrer</dt>
        <dd className="u-py-1">
          <PersonSelect
            value={referrerId}
            compact
            emptyLabel="No referrer"
            ariaLabel="Referred by"
            options={props.referrerOptions.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(v) => {
              setReferrerId(v);
              updateApplication(props.appId, { referrer_person_id: v || null });
            }}
          />
        </dd>
        <dt>Applied</dt>
        <dd>
          <EditableDate value={toDateInput(props.appliedAt)} ariaLabel="Applied date"
            onSave={(v) => updateApplication(props.appId, { applied_at: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Decided</dt>
        <dd>
          <EditableDate value={toDateInput(props.decidedAt)} ariaLabel="Decided date"
            onSave={(v) => updateApplication(props.appId, { decided_at: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Resume</dt>
        <dd className="u-py-1">
          <ResumeField applicationId={props.appId} resumeDocumentId={props.resumeDocumentId} />
        </dd>
      </dl>
    </section>
  );
}

// A "from AI screen" fallback is only worth showing when the AI actually
// extracted something — its schema writes "Not stated"/"Unknown" when it didn't.
function aiHint(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (["not stated", "unknown", "n/a", "na", "none", "—", "-"].includes(low)) return null;
  return t;
}

function SignalsCard(props: {
  personId: string;
  englishProficiency: string | null;
  canViewSalary: boolean;
  salaryExpectationCents: number | null;
  salaryExpectationCurrency: string | null;
  noticePeriod: string | null;
  poolStatus: string | null;
  doNotHire: boolean;
  aiEnglish: string | null;
  aiSalary: string | null;
  aiNotice: string | null;
}) {
  const [doNotHire, setDoNotHire] = useState(props.doNotHire);
  const english = aiHint(props.aiEnglish);
  const notice = aiHint(props.aiNotice);
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-1">Signals</div>
      <div className="admin-hint u-mb-2">
        Recruiter-verified. Overrides the AI screen; leave blank to keep showing the AI value.
      </div>
      <dl className="admin-kv admin-kv--editable">
        <dt>English</dt>
        <dd>
          <EditableText value={props.englishProficiency ?? ""} fallback={english} placeholder="Add…" ariaLabel="English proficiency"
            onSave={(v) => updateApplicantProfile(props.personId, { english_proficiency: v.trim() || null })} />
        </dd>
        {props.canViewSalary && (
          <>
            <dt>Salary</dt>
            <dd className="u-py-1">
              <SalaryField
                personId={props.personId}
                cents={props.salaryExpectationCents}
                currency={props.salaryExpectationCurrency}
                aiFallback={aiHint(props.aiSalary)}
              />
            </dd>
          </>
        )}
        <dt>Notice</dt>
        <dd>
          <EditableText value={props.noticePeriod ?? ""} fallback={notice} placeholder="Add…" ariaLabel="Notice period"
            onSave={(v) => updateApplicantProfile(props.personId, { notice_period: v.trim() || null })} />
        </dd>
        <dt>Pool</dt>
        <dd>
          <EditableSelect value={props.poolStatus ?? ""} placeholder="—" ariaLabel="Pool status"
            options={POOL_STATUS_OPTIONS.map(([v, l]) => ({ value: v, label: l }))}
            onSave={(v) => updateApplicantProfile(props.personId, { pool_status: v || null })} />
        </dd>
      </dl>
      <label className="u-row u-mt-3 u-pointer">
        <input
          type="checkbox"
          checked={doNotHire}
          onChange={(e) => {
            const next = e.target.checked;
            setDoNotHire(next);
            updateApplicantProfile(props.personId, { do_not_hire: next }).then((r) => {
              if (!r.ok) setDoNotHire(!next);
            });
          }}
        />
        <span>
          Do not hire <span className="admin-cell-muted">(would not consider again)</span>
        </span>
      </label>
    </section>
  );
}

function AssessmentCard({ appId, hrAssessment }: { appId: string; hrAssessment: string | null }) {
  return (
    <section className="admin-card admin-section-card admin-record-assessment">
      <div className="admin-section-label u-row u-gap-3 u-between u-mb-1">
        <span>HR assessment</span>
        <span className="admin-cell-muted u-label">
          your read
        </span>
      </div>
      <div className="admin-hint u-mb-3">
        Your own read on this candidate. Separate from the AI screen and interview scorecards.
      </div>
      <EditableTextarea
        value={hrAssessment ?? ""}
        rows={6}
        collapsedHeight={AI_COLLAPSED_HEIGHT}
        placeholder="Strengths, concerns, anything the interview surfaced that the resume missed…"
        ariaLabel="HR assessment"
        onSave={(v) => updateApplication(appId, { hr_assessment: v.trim() || null }).then((r) => (r.ok ? ok() : r))}
      />
    </section>
  );
}

// ─── Resume + salary (unchanged behavior, restyled placement) ────────────────

function ResumeField({ applicationId, resumeDocumentId }: { applicationId: string; resumeDocumentId: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState(resumeDocumentId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("resume", file);
    const r = await uploadApplicationResume(applicationId, fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!r.ok) return setErr(r.error);
    setDocId(r.documentId);
    router.refresh();
  }

  return (
    <span className="u-row u-wrap">
      {docId ? (
        <a href={`/admin/talent/resume/${docId}`} target="_blank" rel="noreferrer" className="admin-cell-strong">
          Open ↗
        </a>
      ) : (
        <span className="admin-cell-muted">none</span>
      )}
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : docId ? "Replace" : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="u-hidden-input"
        onChange={onFile}
      />
      {err && <span className="u-err">{err}</span>}
    </span>
  );
}

const SALARY_CURRENCIES = ["VND", "USD", "EUR", "GBP", "AUD", "SGD"];

function SalaryField({
  personId,
  cents,
  currency,
  aiFallback,
}: {
  personId: string;
  cents: number | null;
  currency: string | null;
  aiFallback: string | null;
}) {
  const [amount, setAmount] = useState(cents != null ? String(Math.round(cents / 100)) : "");
  const [cur, setCur] = useState(currency || "VND");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(nextAmount: string, nextCur: string) {
    const cleaned = nextAmount.replace(/[,\s]/g, "").trim();
    const parsed = cleaned === "" ? null : Number(cleaned);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      setErr("Enter a number.");
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await updateApplicantProfile(personId, {
      salary_expectation_cents: parsed == null ? null : Math.round(parsed * 100),
      salary_expectation_currency: parsed == null ? null : nextCur,
    });
    setSaving(false);
    if (!r.ok) setErr(r.error);
  }

  return (
    <span className="u-stack u-gap-1 u-w-full">
      <span className="u-row">
        <input
          className="admin-input u-grow"
          inputMode="numeric"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={(e) => save(e.target.value, cur)}
        />
        <select
          className="admin-select u-max-0"
          aria-label="Currency"
          value={cur}
          onChange={(e) => {
            setCur(e.target.value);
            if (amount.trim()) save(amount, e.target.value);
          }}
        >
          {SALARY_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </span>
      {saving && <span className="admin-hint">Saving…</span>}
      {err && <span className="u-sm u-err">{err}</span>}
      {!amount.trim() && aiFallback && <span className="admin-hint">AI: {aiFallback}</span>}
    </span>
  );
}

// ─── Feedback thread ─────────────────────────────────────────────────────────

// An append-only, attributed feedback thread for this application, stored in the
// shared interactions log. Distinct from the structured interview scorecards.
function FeedbackThread({ applicationId }: { applicationId: string }) {
  const [items, setItems] = useState<AppNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadErr(null);
    getApplicationNotes(applicationId).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items);
      else setLoadErr(r.error);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [applicationId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setSaveErr(null);
    const r = await addApplicationNote(applicationId, text);
    setSaving(false);
    if (!r.ok) return setSaveErr(r.error);
    setItems((cur) => [r.item, ...cur]);
    setBody("");
  }

  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Feedback</div>
      <div className="u-row u-mb-3">
        <textarea
          className="admin-input u-grow"
          rows={2}
          placeholder="Add feedback for this candidate…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn admin-btn--primary admin-btn--sm u-self-start"
          onClick={add}
          disabled={saving || !body.trim()}
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {saveErr && <div className="admin-alert admin-alert--err u-mb-3">{saveErr}</div>}

      {loading ? (
        <div className="admin-hint">Loading…</div>
      ) : loadErr ? (
        <div className="admin-alert admin-alert--err">{loadErr}</div>
      ) : items.length === 0 ? (
        <div className="admin-empty">No feedback yet.</div>
      ) : (
        <ul className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
          {items.map((n) => (
            <li key={n.id} className="u-pl-3 admin-quote">
              <div className="admin-cell-muted u-mb-1 u-sm">
                {n.author ? `${n.author} · ` : ""}
                {formatDate(n.occurredAt)}
              </div>
              <div className="u-ink-2 u-prewrap">{n.body || "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
