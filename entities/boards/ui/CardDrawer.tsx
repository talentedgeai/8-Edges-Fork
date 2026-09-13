"use client";

import { useState } from "react";
import Link from "next/link";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { WorkboardData, WorkboardCard, WorkboardLane } from "@/entities/boards/lib/workboard";
import { PRIORITY_LABEL, SUBJECT_COMMITMENT, TASK_PRIORITIES, type EpicRow, type TaskPriority } from "@/entities/boards/lib/types";
import { CardTargetFields } from "./CardTargetFields";
import { CardPlanningFields } from "./CardPlanningFields";
import { CardSubtasks } from "./CardSubtasks";
import { CardBlockers } from "./CardBlockers";
import { CardComments } from "./CardComments";
import type { Form, RunAction } from "./board-view-types";

// The one card drawer: the form for a new or existing card (title, client and
// board on a many-board scope, column, priority, assignee, sprint, epic,
// roadmap link, internal flag, dates, Human Tokens, description), then the
// subtasks and comments of an existing card. A read-only surface opens the
// same drawer with every field disabled and no actions (WB-01).
export function CardDrawer({
  form,
  setForm,
  data,
  activeCard,
  lanes,
  currentLaneId,
  readOnly,
  shareUrl,
  boardHref,
  saving,
  run,
  onMoveLane,
  onSave,
  onArchive,
}: {
  form: Form | null;
  setForm: (form: Form | null) => void;
  data: WorkboardData;
  activeCard: WorkboardCard | null;
  lanes: WorkboardLane[];
  /** The optimistic lane of the open card, when a move is in flight. */
  currentLaneId?: string;
  readOnly: boolean;
  /** The card's own shareable link (board page + ?card=id), for "Copy link". */
  shareUrl: string | null;
  /** Where the card's own board page is, on a many-board scope; null hides the link. */
  boardHref: string | null;
  saving: boolean;
  run: RunAction;
  onMoveLane: (cardId: string, laneId: string) => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(`${window.location.origin}${shareUrl}`).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}, // clipboard can be blocked; the link is still visible via Open board
    );
  }
  const board = form ? data.boards.find((b) => b.id === form.boardId) : undefined;
  const isClientBoard = board?.client_company_id != null;
  const single = data.boards.length === 1;
  // Sprints and epics belong to a board; nothing to offer until one is chosen.
  const activeSprints = board ? data.sprints.filter((s) => s.status === "active" && s.board_id === board.id) : [];
  const activeEpics = board ? data.epics.filter((e) => e.status === "active" && e.board_id === board.id) : [];
  const epicById = new Map<string, EpicRow>(data.epics.map((e) => [e.id, e]));
  const slug = board?.slug ?? "";
  return (
    <DetailDrawer
      open={form !== null}
      onClose={() => setForm(null)}
      eyebrow={form?.id ? "Card" : "New card"}
      title={form?.id ? form.title || "Card" : "New card"}
    >
      {form && (
        <fieldset className="admin-form" disabled={readOnly}>
          <div className="admin-field">
            <label className="admin-label">Title</label>
            <input
              className="admin-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs doing?"
              autoFocus={!readOnly}
            />
          </div>

          {form.subjectType === SUBJECT_COMMITMENT && (
            <div className="admin-field admin-alert admin-alert--ok">
              <label className="admin-label u-ok">Linked commitment</label>
              <div>{form.subjectLabel ?? "Coaching commitment"}</div>
              <div className="u-sm u-mt-1">Moving this card to a done column marks the commitment kept.</div>
            </div>
          )}

          <CardTargetFields
            form={form}
            setForm={setForm}
            data={data}
            lanes={lanes}
            currentLaneId={currentLaneId}
            readOnly={readOnly}
            onMoveLane={onMoveLane}
          />

          <div className="admin-field">
            <label className="admin-label">Priority</label>
            <select className="admin-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label className="admin-label">Assignee</label>
            <select className="admin-select" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {data.people.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <CardPlanningFields
            form={form}
            setForm={setForm}
            activeSprints={activeSprints}
            activeEpics={activeEpics}
            epicById={epicById}
            isClientBoard={isClientBoard && !readOnly}
            backlogItems={single ? data.backlogItems : []}
            backlogGroups={single ? data.backlogGroups : []}
          />

          <div className="admin-field">
            <label className="admin-label">Due date</label>
            <input className="admin-input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>

          <div className="admin-field">
            <label className="admin-label">Human Tokens</label>
            <input
              className="admin-input"
              type="number"
              min={0}
              step={1}
              placeholder="Not estimated"
              value={form.humanTokens}
              onChange={(e) => setForm({ ...form, humanTokens: e.target.value })}
            />
          </div>

          {(!readOnly || form.description) && (
            <div className="admin-field">
              <label className="admin-label">Description</label>
              <textarea className="admin-textarea" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          )}

          {form.id && (
            <>
              <div className="admin-field">
                <label className="admin-label">Pull request</label>
                <input
                  className="admin-input"
                  type="url"
                  inputMode="url"
                  placeholder="https://github.com/…/pull/123"
                  value={form.prUrl}
                  onChange={(e) => setForm({ ...form, prUrl: e.target.value })}
                />
              </div>
              {(!readOnly || form.buildSummary) && (
                <div className="admin-field">
                  <label className="admin-label">Build summary</label>
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    placeholder="A short summary of what this PR ships."
                    value={form.buildSummary}
                    onChange={(e) => setForm({ ...form, buildSummary: e.target.value })}
                  />
                </div>
              )}
            </>
          )}

          {activeCard && (!readOnly || activeCard.subtasks.length > 0) && (
            <CardSubtasks card={activeCard} slug={slug} saving={saving} run={run} readOnly={readOnly} />
          )}
          {activeCard && (!readOnly || activeCard.blockers.length > 0) && (
            <CardBlockers
              card={activeCard}
              slug={slug}
              people={data.people}
              clientContacts={data.clientContacts}
              saving={saving}
              run={run}
              readOnly={readOnly}
            />
          )}
          {activeCard && (!readOnly || activeCard.comments.length > 0) && (
            <CardComments card={activeCard} slug={slug} saving={saving} run={run} readOnly={readOnly} />
          )}

          {!readOnly && (
            <div className="admin-form-actions">
              <button className="admin-btn admin-btn--primary" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save" : "Create card"}
              </button>
              {form.id && shareUrl && (
                <button className="admin-btn" onClick={copyLink} title={`${shareUrl}`}>
                  {copied ? "Link copied ✓" : "Copy link"}
                </button>
              )}
              {form.id && (
                <button className="admin-btn admin-btn--danger" onClick={onArchive} disabled={saving}>
                  Archive
                </button>
              )}
              {form.id && boardHref && (
                <Link className="admin-btn u-ml-auto" href={boardHref}>
                  Open board →
                </Link>
              )}
            </div>
          )}
        </fieldset>
      )}
    </DetailDrawer>
  );
}
