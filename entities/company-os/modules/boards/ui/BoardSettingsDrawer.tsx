"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { BoardDetail, BoardPerson } from "@/entities/company-os/modules/boards/data";
import { addBoardMember, archiveBoard, removeBoardMember, updateBoard } from "@/entities/company-os/routes/(dashboard)/boards/[slug]/actions";
import type { RunAction } from "./board-view-types";

// Board settings: name, description, client and AI Program, the member list,
// and archiving the board. Split out of BoardView (Q3); it owns the field
// state, seeded from the board.
export function BoardSettingsDrawer({
  open,
  onClose,
  board,
  slug,
  members,
  teamOptions,
  clientOptions,
  programOptions,
  saving,
  run,
}: {
  open: boolean;
  onClose: () => void;
  board: BoardDetail["board"];
  slug: string;
  members: BoardDetail["members"];
  teamOptions: BoardPerson[];
  clientOptions: { id: string; name: string }[];
  programOptions: { id: string; name: string; company_id: string }[];
  saving: boolean;
  run: RunAction;
}) {
  const router = useRouter();
  const [boardName, setBoardName] = useState(board.name);
  const [boardDescription, setBoardDescription] = useState(board.description ?? "");
  const [boardClientId, setBoardClientId] = useState(board.client_company_id ?? "");
  const [boardProgramId, setBoardProgramId] = useState(board.ai_program_id ?? "");
  const [newMemberId, setNewMemberId] = useState("");

  const memberIds = new Set(members.map((m) => m.id));
  const addableMembers = teamOptions.filter((p) => !memberIds.has(p.id));

  // Programs offerable for the currently selected client; a program from a
  // different company never reaches the save call.
  const clientPrograms = useMemo(
    () => programOptions.filter((p) => boardClientId && p.company_id === boardClientId),
    [programOptions, boardClientId],
  );

  function saveSettings() {
    // Only send the program key when the user actually changed the select, so
    // an unrelated rename never clears an existing program tag, even when the
    // options list failed to load and the current program is not in it.
    const programPatch =
      boardProgramId !== (board.ai_program_id ?? "")
        ? { aiProgramId: boardProgramId || null }
        : {};
    run(() =>
      updateBoard(
        board.id,
        {
          name: boardName,
          description: boardDescription,
          clientCompanyId: boardClientId || null,
          ...programPatch,
        },
        slug,
      ),
    );
  }

  function addMember() {
    if (!newMemberId) return;
    run(() => addBoardMember(board.id, newMemberId, slug), () => setNewMemberId(""));
  }

  function removeMember(personId: string) {
    run(() => removeBoardMember(board.id, personId, slug));
  }

  return (
    <DetailDrawer open={open} onClose={onClose} eyebrow="Board" title="Board settings">
      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label">Name</label>
          <input className="admin-input" value={boardName} onChange={(e) => setBoardName(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Description</label>
          <textarea
            className="admin-textarea"
            rows={2}
            value={boardDescription}
            onChange={(e) => setBoardDescription(e.target.value)}
            placeholder="What this board is for"
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Client</label>
          <select
            className="admin-select"
            value={boardClientId}
            onChange={(e) => setBoardClientId(e.target.value)}
          >
            <option value="">No client (internal board)</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="admin-hint">A client board is read-only in that client&apos;s portal.</p>
        </div>
        {boardClientId && clientPrograms.length > 0 && (
          <div className="admin-field">
            <label className="admin-label">AI Program</label>
            <select
              className="admin-select"
              value={clientPrograms.some((p) => p.id === boardProgramId) ? boardProgramId : ""}
              onChange={(e) => setBoardProgramId(e.target.value)}
            >
              <option value="">Company-wide</option>
              {clientPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="admin-hint">Optional: key this board to one of the client&apos;s AI Programs.</p>
          </div>
        )}
        <div className="admin-form-actions">
          <button className="admin-btn admin-btn--primary" onClick={saveSettings} disabled={saving}>
            Save
          </button>
        </div>

        <div className="u-mt-4">
          <label className="admin-label">Members ({members.length})</label>
          {members.map((m) => (
            <div key={m.id} className="admin-row-divided">
              <span className="admin-cell-strong u-grow">
                {m.name}
              </span>
              <button className="admin-btn admin-btn--sm" onClick={() => removeMember(m.id)} disabled={saving}>
                Remove
              </button>
            </div>
          ))}
          <div className="u-row u-mt-3">
            <select
              className="admin-select u-grow"
              value={newMemberId}
              onChange={(e) => setNewMemberId(e.target.value)}
              aria-label="Add member"
            >
              <option value="">Add a member…</option>
              {addableMembers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="admin-btn" onClick={addMember} disabled={saving || !newMemberId}>
              Add
            </button>
          </div>
        </div>

        <div className="admin-divider-top">
          <ConfirmButton
            label="Archive board"
            title="Archive this board?"
            body={
              <>
                <strong>{board.name}</strong> disappears from everyone&apos;s boards.
              </>
            }
            confirmLabel="Archive"
            disabled={saving}
            onConfirm={() => archiveBoard(board.id)}
            onDone={() => router.push("/admin/boards")}
          />
        </div>
      </div>
    </DetailDrawer>

  );
}
