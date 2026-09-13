"use client";

import type { WorkboardData, WorkboardLane } from "@/entities/boards/lib/workboard";
import { INTERNAL, type Form } from "./board-view-types";

// Where a card lives: on a many-board scope a new card picks its client (or
// Internal) and, when that client has several boards, the board; an existing
// card shows its board and lane, with a lane select as the tap path to move it
// so touch users are not forced to drag across a scrolling board (WB-01).
export function CardTargetFields({
  form,
  setForm,
  data,
  lanes,
  currentLaneId,
  readOnly,
  onMoveLane,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  data: WorkboardData;
  lanes: WorkboardLane[];
  /** The optimistic lane of the open card, when a move is in flight. */
  currentLaneId?: string;
  readOnly: boolean;
  onMoveLane: (cardId: string, laneId: string) => void;
}) {
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const board = data.boards.find((b) => b.id === form.boardId);
  const boardsOf = (clientId: string) => data.boards.filter((b) => (clientId === INTERNAL ? b.client_company_id === null : b.client_company_id === clientId));
  const clientBoards = form.clientId ? boardsOf(form.clientId) : [];
  const hasInternal = data.boards.some((b) => b.client_company_id === null);

  function pickClient(clientId: string) {
    const boards = boardsOf(clientId);
    setForm({ ...form, clientId, boardId: boards[0]?.id ?? "", internal: false, roadmapItemId: "", sprintId: "", epicId: "" });
  }

  return (
    <>
      {!single && form.id === null && (
        <>
          <div className="admin-field">
            <label className="admin-label">Client</label>
            <select className="admin-select" value={form.clientId} onChange={(e) => pickClient(e.target.value)}>
              {!form.clientId && <option value="">Choose a client…</option>}
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {hasInternal && <option value={INTERNAL}>Internal</option>}
            </select>
          </div>
          {clientBoards.length > 1 && (
            <div className="admin-field">
              <label className="admin-label">Board</label>
              <select className="admin-select" value={form.boardId} onChange={(e) => setForm({ ...form, boardId: e.target.value })}>
                {clientBoards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {!single && form.id && board && (
        <div className="admin-field">
          <label className="admin-label">Board</label>
          <div>
            {board.name}
            {board.client_name ? ` · ${board.client_name}` : ""}
          </div>
        </div>
      )}

      {form.id && (
        <div className="admin-field">
          <label className="admin-label">Column</label>
          <select
            className="admin-select"
            value={currentLaneId ?? form.laneId}
            disabled={readOnly}
            onChange={(e) => onMoveLane(form.id!, e.target.value)}
          >
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
