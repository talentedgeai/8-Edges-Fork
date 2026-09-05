"use client";

import type { BoardDetail } from "@/entities/company-os/modules/boards/data";
import { SUBJECT_COMMITMENT } from "@/entities/company-os/modules/boards/types";
import type { Form } from "./board-view-types";

// The card form's planning links: sprint, epic, and on a client board the
// roadmap item and the internal flag. Split out of CardDrawer (Q3).
export function CardPlanningFields({
  form,
  setForm,
  activeSprints,
  activeEpics,
  epicById,
  isClientBoard,
  backlogItems,
  backlogGroups,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  activeSprints: BoardDetail["sprints"];
  activeEpics: BoardDetail["epics"];
  epicById: Map<string, BoardDetail["epics"][number]>;
  isClientBoard: boolean;
  backlogItems: BoardDetail["backlogItems"];
  backlogGroups: BoardDetail["backlogGroups"];
}) {
  return (
    <>
      {activeSprints.length > 0 && (
        <div className="admin-field">
          <label className="admin-label">Sprint</label>
          <select
            className="admin-select"
            value={form.sprintId}
            onChange={(e) => setForm({ ...form, sprintId: e.target.value })}
          >
            <option value="">No sprint (backlog)</option>
            {activeSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(activeEpics.length > 0 || form.epicId) && (
        <div className="admin-field">
          <label className="admin-label">Epic</label>
          <select
            className="admin-select"
            value={form.epicId}
            onChange={(e) => setForm({ ...form, epicId: e.target.value })}
          >
            <option value="">No epic</option>
            {activeEpics.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            {/* An archived epic still tagged on this card stays selectable so it shows and can be changed. */}
            {form.epicId && !activeEpics.some((e) => e.id === form.epicId) && epicById.get(form.epicId) && (
              <option value={form.epicId}>{epicById.get(form.epicId)?.name} (archived)</option>
            )}
          </select>
        </div>
      )}

      {isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && (
        <div className="admin-field">
          <label className="admin-label">Roadmap item</label>
          <select
            className="admin-select"
            value={form.roadmapItemId}
            onChange={(e) => setForm({ ...form, roadmapItemId: e.target.value })}
          >
            <option value="">Not linked</option>
            {backlogGroups.map((g) => {
              const items = backlogItems.filter((b) => b.group_key === g.key);
              if (!items.length) return null;
              return (
                <optgroup key={g.key} label={g.label}>
                  {items.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {(() => {
              // Items whose group is archived or missing still need to be linkable.
              const known = new Set(backlogGroups.map((g) => g.key));
              const rest = backlogItems.filter((b) => !b.group_key || !known.has(b.group_key));
              if (!rest.length) return null;
              return (
                <optgroup label="Other">
                  {rest.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              );
            })()}
          </select>
        </div>
      )}

      {isClientBoard && (
        <div className="admin-field">
          <label className="admin-label u-row">
            <input
              type="checkbox"
              checked={form.internal}
              onChange={(e) => setForm({ ...form, internal: e.target.checked })}
            />
            Internal (hidden from the client portal)
          </label>
        </div>
      )}
    </>
  );
}
