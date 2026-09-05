"use client";

import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { BoardCard, BoardDetail } from "@/entities/company-os/modules/boards/data";
import {
  PRIORITY_LABEL,
  SUBJECT_COMMITMENT,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/entities/company-os/modules/boards/types";
import { CardPlanningFields } from "./CardPlanningFields";
import { CardSubtasks } from "./CardSubtasks";
import { CardComments } from "./CardComments";
import type { Form, RunAction } from "./board-view-types";

// The card drawer: the form for a new or existing card (title, column,
// priority, assignee, sprint, epic, roadmap link, internal flag, dates, Human
// Tokens, description), then the subtasks and comments of an existing card.
// Split out of BoardView (Q3); the form state lives in useCardForm.
export function CardDrawer({
  form,
  setForm,
  activeCard,
  currentColumnId,
  columns,
  kanbanColumns,
  assigneeOptions,
  activeSprints,
  activeEpics,
  epicById,
  isClientBoard,
  backlogItems,
  backlogGroups,
  slug,
  saving,
  run,
  onMoveColumn,
  onSave,
  onArchive,
}: {
  form: Form | null;
  setForm: (form: Form | null) => void;
  activeCard: BoardCard | null;
  /** The optimistic column of the open card, when a move is in flight. */
  currentColumnId?: string;
  columns: BoardDetail["columns"];
  kanbanColumns: KanbanColumn[];
  assigneeOptions: { id: string; name: string }[];
  activeSprints: BoardDetail["sprints"];
  activeEpics: BoardDetail["epics"];
  epicById: Map<string, BoardDetail["epics"][number]>;
  isClientBoard: boolean;
  backlogItems: BoardDetail["backlogItems"];
  backlogGroups: BoardDetail["backlogGroups"];
  slug: string;
  saving: boolean;
  run: RunAction;
  onMoveColumn: (cardId: string, toColumnId: string) => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  return (
    <DetailDrawer
      open={form !== null}
      onClose={() => setForm(null)}
      eyebrow={form?.id ? "Card" : "New card"}
      title={form?.id ? form.title || "Card" : "New card"}
    >
      {form && (
        <div className="admin-form">
          <div className="admin-field">
            <label className="admin-label">Title</label>
            <input
              className="admin-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs doing?"
              autoFocus
            />
          </div>

          {form.subjectType === SUBJECT_COMMITMENT && (
            <div className="admin-field admin-alert admin-alert--ok">
              <label className="admin-label u-ok">
                Linked commitment
              </label>
              <div>{form.subjectLabel ?? "Coaching commitment"}</div>
              <div className="u-sm u-mt-1">
                Moving this card to a done column marks the commitment kept.
              </div>
            </div>
          )}

          {form.id && (
            <div className="admin-field">
              <label className="admin-label">Column</label>
              {/* A tap path to move a card, so touch users are not forced to drag
                  across a horizontally scrolling board. Drag stays the desktop
                  fast path. */}
              <select
                className="admin-select"
                value={currentColumnId ?? form.columnId}
                onChange={(e) => onMoveColumn(form.id!, e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="admin-field">
            <label className="admin-label">Priority</label>
            <select
              className="admin-select"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label className="admin-label">Assignee</label>
            <select
              className="admin-select"
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((o) => (
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
            isClientBoard={isClientBoard}
            backlogItems={backlogItems}
            backlogGroups={backlogGroups}
          />

          <div className="admin-field">
            <label className="admin-label">Due date</label>
            <input
              className="admin-input"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
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

          <div className="admin-field">
            <label className="admin-label">Description</label>
            <textarea
              className="admin-textarea"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {activeCard && <CardSubtasks card={activeCard} slug={slug} saving={saving} run={run} />}

          {activeCard && <CardComments card={activeCard} slug={slug} saving={saving} run={run} />}

          <div className="admin-form-actions">
            <button className="admin-btn admin-btn--primary" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : form.id ? "Save" : "Create card"}
            </button>
            {form.id && (
              <button className="admin-btn admin-btn--danger" onClick={onArchive} disabled={saving}>
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </DetailDrawer>

  );
}
