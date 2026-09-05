"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { BoardDetail } from "@/entities/company-os/modules/boards/data";
import { EPIC_COLORS, epicColor, epicColorIndex } from "@/entities/company-os/modules/boards/types";
import { createEpic, setEpicArchived, updateEpic } from "@/entities/company-os/routes/(dashboard)/boards/[slug]/actions";
import type { Card, RunAction } from "./board-view-types";

// The board's epics: create, rename, recolour, archive and restore. Split out
// of BoardView (Q3); it owns the create form.
export function EpicsDrawer({
  open,
  onClose,
  boardId,
  slug,
  epics,
  cards,
  sourceCards,
  saving,
  run,
  onError,
  onArchived,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  slug: string;
  epics: BoardDetail["epics"];
  cards: Card[];
  sourceCards: BoardDetail["cards"];
  saving: boolean;
  run: RunAction;
  onError: (message: string) => void;
  /** The board drops an epic filter that pointed at the epic just archived. */
  onArchived: (epicId: string) => void;
}) {
  const [epicForm, setEpicForm] = useState<{ name: string; color: string; description: string }>({
    name: "",
    color: EPIC_COLORS[0],
    description: "",
  });

  function addEpic() {
    if (!epicForm.name.trim()) return onError("Name the epic.");
    run(
      () => createEpic(boardId, { name: epicForm.name, color: epicForm.color, description: epicForm.description || undefined }, slug),
      () => setEpicForm({ name: "", color: EPIC_COLORS[0], description: "" }),
    );
  }

  function renameEpic(epicId: string, name: string) {
    run(() => updateEpic(epicId, { name }, slug));
  }

  function recolorEpic(epicId: string, color: string) {
    run(() => updateEpic(epicId, { color }, slug));
  }

  function toggleEpicArchived(epicId: string, archived: boolean) {
    run(() => setEpicArchived(epicId, archived, slug), () => {
      if (archived) onArchived(epicId);
    });
  }

  return (
    <DetailDrawer open={open} onClose={onClose} eyebrow="Board" title="Epics">
      <div className="admin-form">
        <p className="admin-hint u-mt-0">
          An epic groups cards into a larger feature. Filter the board to one epic from the toolbar.
        </p>
        <div className="admin-field">
          <label className="admin-label">New epic</label>
          <input
            className="admin-input"
            placeholder="Name (e.g. Barrel calculator)"
            value={epicForm.name}
            onChange={(e) => setEpicForm({ ...epicForm, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEpic();
              }
            }}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Color</label>
          <div className="admin-board-epic-swatches">
            {EPIC_COLORS.map((col) => (
              <button
                key={col}
                type="button"
                aria-label={`Color ${col}`}
                onClick={() => setEpicForm({ ...epicForm, color: col })}
                className={`admin-board-epic-swatch${epicForm.color === col ? " is-selected" : ""}`}
                data-epic-color={EPIC_COLORS.indexOf(col)}
              />
            ))}
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Description (optional)</label>
          <input
            className="admin-input"
            value={epicForm.description}
            onChange={(e) => setEpicForm({ ...epicForm, description: e.target.value })}
          />
        </div>
        <div className="admin-form-actions">
          <button className="admin-btn admin-btn--primary" onClick={addEpic} disabled={saving}>
            Add epic
          </button>
        </div>

        {epics.length > 0 && (
          <div className="u-mt-4">
            <label className="admin-label">Existing</label>
            {epics.map((e) => {
              const count = sourceCards.filter((c) => c.epic_id === e.id).length;
              return (
                <div key={e.id} className="admin-board-epic-row">
                  <span className="admin-board-epic-row-dot" data-epic-color={epicColorIndex(e.color)} />
                  <input
                    className="admin-input u-flex-1 u-min-1"
                    defaultValue={e.name}
                    key={`${e.id}-${e.name}`}
                    onBlur={(ev) => {
                      const v = ev.target.value.trim();
                      if (v && v !== e.name) renameEpic(e.id, v);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        (ev.target as HTMLInputElement).blur();
                      }
                    }}
                    disabled={saving}
                  />
                  {e.status === "archived" && <Badge tone="neutral">archived</Badge>}
                  <span className="admin-cell-muted u-sm">
                    {count} {count === 1 ? "card" : "cards"}
                  </span>
                  <button
                    className="admin-btn admin-btn--sm"
                    onClick={() => toggleEpicArchived(e.id, e.status !== "archived")}
                    disabled={saving}
                  >
                    {e.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  <div className="admin-board-epic-row-swatches">
                    {EPIC_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        aria-label={`Set color ${col}`}
                        onClick={() => recolorEpic(e.id, col)}
                        disabled={saving}
                        className={`admin-board-epic-swatch admin-board-epic-swatch--sm${epicColor(e.color) === col ? " is-selected" : ""}`}
                        data-epic-color={EPIC_COLORS.indexOf(col)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DetailDrawer>

  );
}
