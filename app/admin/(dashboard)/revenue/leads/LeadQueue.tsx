"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/admin/Badge";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { formatDate, humanize } from "@/lib/admin/format";
import {
  bookMeetingAndHandOff,
  deleteLeadPerson,
  disqualifyLead,
  logCall,
  markConnected,
  pinLead,
  removeFromQueue,
  saveQualification,
  unpinLead,
} from "./actions";

export type QueueRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  source: string | null;
  stage: string;
  status: string;
  slaDueAt: string | null;
  attemptCount: number;
  pinnedAt: string | null;
  inquiry: { subject: string | null; message: string | null; createdAt: string } | null;
  qual: {
    goal: string;
    plan: string;
    challenge: string;
    timeline: string;
    budget: string;
    authority: string;
  };
};

const DISQUALIFY_REASONS = [
  ["no_budget", "No budget"],
  ["no_need", "No need"],
  ["bad_timing", "Bad timing"],
  ["no_authority", "No authority"],
  ["unresponsive", "Unresponsive"],
  ["competitor", "Chose competitor"],
  ["not_icp", "Not our ICP"],
  ["other", "Other"],
] as const;

const GPCT_FIELDS = [
  ["goal", "Goal"],
  ["plan", "Plan"],
  ["challenge", "Challenge"],
  ["timeline", "Timeline"],
  ["budget", "Budget"],
  ["authority", "Authority"],
] as const;

function slaBadge(slaDueAt: string | null) {
  if (!slaDueAt) return null;
  const mins = Math.round((new Date(slaDueAt).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const h = Math.floor(-mins / 60);
    return <Badge tone="err">SLA overdue {h > 0 ? `${h}h` : `${-mins}m`}</Badge>;
  }
  if (mins < 60) return <Badge tone="err">Respond in {mins}m</Badge>;
  return <Badge tone="warn">Respond in {Math.round(mins / 60)}h</Badge>;
}

function statusBadge(status: string) {
  const tone =
    status === "meeting_booked" ? "ok" : status === "connected" ? "info" : "neutral";
  return <Badge tone={tone}>{humanize(status)}</Badge>;
}

export function LeadQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Local copy so a drag can flip pinned state immediately; resynced whenever
  // the server sends a fresh (SLA-recomputed) order after a round-trip.
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBanner(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setBanner(r.error);
      else router.refresh();
    });
  }

  // Two drop zones, not one continuous list: dropping into "Pinned" pins the
  // lead (boosted above the SLA queue), dropping into "Queue" unpins it. This
  // gives drag a whole zone to land in rather than a single precise slot — a
  // one-index-wide target got fragile once anything was already pinned.
  // Reordering within a zone is a no-op; neither zone tracks relative order.
  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const row = localRows.find((r) => r.id === draggableId);
    if (!row) return;

    const nowPinned = destination.droppableId === "pinned-zone";
    setLocalRows((rs) =>
      rs.map((r) => (r.id === draggableId ? { ...r, pinnedAt: nowPinned ? new Date().toISOString() : null } : r)),
    );
    run(() => (nowPinned ? pinLead(row.id) : unpinLead(row.id)));
  }

  if (rows.length === 0) {
    return (
      <div className="admin-empty">
        Queue is clear. Promote people from Contacts, or wait for inbound.
      </div>
    );
  }

  const pinnedRows = localRows.filter((r) => r.pinnedAt);
  const queueRows = localRows.filter((r) => !r.pinnedAt);

  function renderCard(r: QueueRow, i: number) {
    const open = openId === r.id;
    return (
      <Draggable draggableId={r.id} index={i} key={r.id}>
        {(dp, ds) => (
          <div
            ref={dp.innerRef}
            {...dp.draggableProps}
            className={`admin-lead-card${open ? " is-open" : ""}${r.pinnedAt ? " is-pinned" : ""}${ds.isDragging ? " is-dragging" : ""}`}
          >
            <div
              className="admin-lead-head"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : r.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setOpenId(open ? null : r.id);
              }}
            >
              <span
                className="admin-lead-drag-handle"
                {...dp.dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Drag ${r.name} to pin or unpin`}
                title={r.pinnedAt ? "Drag down to the queue to unpin" : "Drag up to Pinned to boost to the top"}
              >
                ⠿
              </span>
              <div className="admin-lead-head-main">
                <div className="admin-lead-name">
                  {r.name}
                  {r.company ? <span className="admin-cell-muted"> · {r.company}</span> : null}
                </div>
                <div className="admin-lead-sub">
                  {r.inquiry?.subject || r.inquiry?.message || r.email}
                </div>
              </div>
              <div className="admin-lead-head-meta">
                {r.pinnedAt && <Badge tone="info">Pinned</Badge>}
                {slaBadge(r.slaDueAt)}
                {statusBadge(r.status)}
                <span className="admin-lead-attempt">
                  {r.attemptCount > 0 ? `attempt ${r.attemptCount}` : "no attempts"}
                </span>
                <button
                  type="button"
                  className={`admin-lead-pin-btn${r.pinnedAt ? " is-active" : ""}`}
                  aria-pressed={!!r.pinnedAt}
                  title={r.pinnedAt ? "Unpin from top of queue" : "Pin to top of queue"}
                  disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation();
                    run(() => (r.pinnedAt ? unpinLead(r.id) : pinLead(r.id)));
                  }}
                >
                  {r.pinnedAt ? "★" : "☆"}
                </button>
              </div>
            </div>

            {open && <LeadDetail row={r} pending={pending} run={run} />}
          </div>
        )}
      </Draggable>
    );
  }

  return (
    <>
      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="admin-lead-zone-label">Pinned</div>
        <Droppable droppableId="pinned-zone">
          {(provided, snapshot) => (
            <div
              className={`admin-lead-queue admin-lead-zone${snapshot.isDraggingOver ? " is-drop-target" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {pinnedRows.length === 0 && !snapshot.isDraggingOver && (
                <div className="admin-lead-zone-empty">Drag a lead here to pin it above the queue</div>
              )}
              {pinnedRows.map((r, i) => renderCard(r, i))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {pinnedRows.length > 0 && <div className="admin-lead-zone-label">Queue</div>}
        <Droppable droppableId="queue-zone">
          {(provided, snapshot) => (
            <div
              className={`admin-lead-queue${snapshot.isDraggingOver ? " is-drop-target" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {queueRows.map((r, i) => renderCard(r, i))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}

function LeadDetail({
  row,
  pending,
  run,
}: {
  row: QueueRow;
  pending: boolean;
  run: (a: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const router = useRouter();
  const [qual, setQual] = useState(row.qual);
  const [callNote, setCallNote] = useState("");
  const [reason, setReason] = useState("");
  const [dqNote, setDqNote] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const capturedCount = GPCT_FIELDS.filter(([k]) => qual[k].trim()).length;

  return (
    <div className="admin-lead-detail">
      <div className="admin-lead-meta-row">
        <Link href={`/admin/contacts/${row.id}`} className="admin-cell-strong">
          Open contact
        </Link>
        <a className="admin-cell-muted" href={`mailto:${row.email}`}>
          {row.email}
        </a>
        {row.phone && <span className="admin-cell-muted">{row.phone}</span>}
        {row.inquiry && (
          <span className="admin-cell-muted">Inbound {formatDate(row.inquiry.createdAt)}</span>
        )}
      </div>

      {row.inquiry?.message && <p className="admin-lead-inquiry">{row.inquiry.message}</p>}

      <div className="admin-lead-section-label">Qualification (GPCT) · {capturedCount}/6 captured</div>
      <div className="admin-lead-gpct">
        {GPCT_FIELDS.map(([key, label]) => (
          <label key={key} className="admin-lead-field">
            <span className="admin-label">{label}</span>
            <input
              className="admin-input"
              value={qual[key]}
              placeholder="Not captured"
              onChange={(e) => setQual((q) => ({ ...q, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="admin-lead-actions u-mb-5">
        <button
          type="button"
          className="admin-btn"
          disabled={pending}
          onClick={() => {
            run(() => saveQualification(row.id, qual));
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
          }}
        >
          {savedFlash ? "Saved" : "Save qualification"}
        </button>
      </div>

      <div className="admin-lead-section-label">Work it</div>
      <div className="admin-lead-actions u-mb-3">
        <input
          className="admin-input admin-lead-note"
          placeholder="Call note (optional)"
          value={callNote}
          onChange={(e) => setCallNote(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn"
          disabled={pending}
          onClick={() => {
            run(() => logCall(row.id, callNote));
            setCallNote("");
          }}
        >
          Log call
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={pending || row.status === "connected"}
          onClick={() => run(() => markConnected(row.id))}
        >
          Connected
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={pending}
          onClick={() => run(() => bookMeetingAndHandOff(row.id))}
        >
          Book meeting and hand off
        </button>
      </div>

      <div className="admin-lead-actions">
        <select
          className="admin-input admin-lead-select"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Disqualify reason…</option>
          {DISQUALIFY_REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="admin-input admin-lead-note"
          placeholder="Note (optional)"
          value={dqNote}
          onChange={(e) => setDqNote(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn"
          disabled={pending || !reason}
          onClick={() => run(() => disqualifyLead(row.id, reason, "nurture", dqNote))}
        >
          Send to nurture
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--danger"
          disabled={pending || !reason}
          onClick={() => run(() => disqualifyLead(row.id, reason, "unqualified", dqNote))}
        >
          Disqualify
        </button>
      </div>

      <div className="admin-danger-zone u-mt-4">
        <div className="admin-danger-row">
          <span className="admin-danger-row-text">
            <strong>Remove from queue</strong> keeps the contact and their history — it just takes them
            off the SDR queue. <strong>Delete person</strong> erases the record entirely (GDPR) and is
            blocked if they have orders, bookings or deals.
          </span>
          <span className="u-row u-shrink-0">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => removeFromQueue(row.id))}
            >
              Remove from queue
            </button>
            <ConfirmButton
              label="Delete person"
              title="Permanently erase this person?"
              body={
                <>
                  This erases <strong>{row.name}</strong> and their linked history under GDPR
                  right-to-erasure. This cannot be undone.
                </>
              }
              confirmLabel="Erase permanently"
              typeToConfirm={row.name}
              onConfirm={() => deleteLeadPerson(row.id)}
              onDone={() => router.refresh()}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
