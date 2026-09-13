"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/entities/boards/lib/types";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { setCardSprint, setTaskTokens, updateCard } from "@/entities/boards/lib/actions";
import { moveCardToBoard } from "@/entities/boards/lib/move-to-board";
import type { Card, RunAction } from "./board-view-types";

type SortKey = "title" | "client" | "status" | "assignee" | "priority" | "sprint" | "tokens" | "due";

// The Workboard's list view (WB-03): the same cards as the lanes, one row
// each, every header sortable, and six cells that edit in place and save on
// change: status (a lane move), Human Tokens, assigned to, sprint (this card's
// own board's sprints), due date, and client, which moves the card to that
// client's board.
// Read-only surfaces get plain cells.
export function WorkboardList({
  data,
  cards,
  canEdit,
  saving,
  run,
  onOpen,
  onMoveLane,
}: {
  data: WorkboardData;
  cards: Card[];
  canEdit: boolean;
  saving: boolean;
  run: RunAction;
  onOpen: (card: Card) => void;
  // The board's own lane move (optimistic, then moveCardColumn), for the Status cell.
  onMoveLane: (cardId: string, laneId: string) => void;
}) {
  const single = data.boards.length === 1;
  const boardById = useMemo(() => new Map(data.boards.map((b) => [b.id, b])), [data.boards]);
  const laneIndex = useMemo(() => new Map(data.lanes.map((l, i) => [l.id, i])), [data.lanes]);
  const laneName = useMemo(() => new Map(data.lanes.map((l) => [l.id, l.name])), [data.lanes]);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name])), [data.sprints]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }

  // Board choices, labelled by client; a client with several boards names them.
  const boardsPerClient = new Map<string, number>();
  for (const b of data.boards) boardsPerClient.set(b.client_company_id ?? "", (boardsPerClient.get(b.client_company_id ?? "") ?? 0) + 1);
  const boardLabel = (b: WorkboardData["boards"][number]) => {
    const client = b.client_name ?? "Internal";
    return (boardsPerClient.get(b.client_company_id ?? "") ?? 0) > 1 ? `${client} · ${b.name}` : client;
  };
  const boardOptions = [...data.boards].sort((a, b) => boardLabel(a).localeCompare(boardLabel(b)));

  // null sortKey = the lanes' own order, as the server returned the cards.
  const sorted = useMemo(() => {
    if (!sortKey) return cards;
    const val = (c: Card): string | number => {
      switch (sortKey) {
        case "title": return c.title.toLowerCase();
        case "client": return (boardById.get(c.board_id ?? "")?.client_name ?? "").toLowerCase();
        case "status": return laneIndex.get(c.columnId) ?? 99;
        case "assignee": return (c.assignee_name ?? "").toLowerCase();
        case "priority": return c.priority;
        case "sprint": return (c.sprint_id && sprintName.get(c.sprint_id)?.toLowerCase()) || "";
        case "tokens": return c.human_tokens ?? -1;
        case "due": return c.due_date ?? "9999";
      }
    };
    return [...cards].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sortAsc ? r : -r;
    });
  }, [cards, sortKey, sortAsc, boardById, laneIndex, sprintName]);

  function saveTokens(c: Card, raw: string) {
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next === c.human_tokens) return;
    run(() => setTaskTokens(c.id, next, boardById.get(c.board_id ?? "")?.slug ?? ""));
  }

  const columns: { key: SortKey; label: string; right?: boolean }[] = [
    { key: "title", label: "Card" },
    ...(single ? [] : [{ key: "client" as const, label: "Client" }]),
    { key: "status", label: "Status" },
    { key: "assignee", label: "Assigned to" },
    { key: "priority", label: "Priority" },
    { key: "sprint", label: "Sprint" },
    { key: "tokens", label: "Human Tokens", right: true },
    { key: "due", label: "Due" },
  ];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`${col.key === "title" ? "u-min-2 " : ""}${col.right ? "u-right " : ""}is-sortable`} aria-sort={sortKey === col.key ? (sortAsc ? "ascending" : "descending") : "none"}>
                  <button type="button" className="admin-auth-link" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sortKey === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="admin-cell-muted">No cards.</td>
              </tr>
            )}
            {sorted.map((c) => {
              const board = boardById.get(c.board_id ?? "");
              const slug = board?.slug ?? "";
              const sprints = data.sprints.filter((s) => s.board_id === c.board_id && (s.status === "active" || s.id === c.sprint_id));
              const overdue = c.due_date != null && c.status !== "done" && c.due_date < today;
              return (
                <tr key={c.id}>
                  <td className="u-min-2">
                    <button type="button" className="admin-auth-link admin-cell-strong" onClick={() => onOpen(c)}>{c.title}</button>
                    {!single && board && <div className="admin-cell-muted u-xs">{board.name}</div>}
                  </td>
                  {!single && (
                    <td>
                      {canEdit ? (
                        <select className="admin-select u-w-auto u-max-2" value={c.board_id ?? ""} disabled={saving} aria-label="Client" onChange={(e) => run(() => moveCardToBoard(c.id, e.target.value))}>
                          {boardOptions.map((b) => <option key={b.id} value={b.id}>{boardLabel(b)}</option>)}
                        </select>
                      ) : (board?.client_name ?? "Internal")}
                    </td>
                  )}
                  <td>
                    {canEdit ? (
                      <select className="admin-select u-w-auto" value={c.columnId} disabled={saving} aria-label="Status" onChange={(e) => onMoveLane(c.id, e.target.value)}>
                        {data.lanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    ) : (laneName.get(c.columnId) ?? c.columnId)}
                  </td>
                  <td>
                    {canEdit ? (
                      <select className="admin-select u-w-auto" value={c.assignee_id ?? ""} disabled={saving} aria-label="Assigned to" onChange={(e) => run(() => updateCard(c.id, { assigneeId: e.target.value || null }, slug))}>
                        <option value="">Unassigned</option>
                        {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (c.assignee_name ?? <span className="admin-cell-muted">Unassigned</span>)}
                  </td>
                  <td><Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge></td>
                  <td>
                    {canEdit && sprints.length > 0 ? (
                      <select className="admin-select u-w-auto" value={c.sprint_id ?? ""} disabled={saving} aria-label="Sprint" onChange={(e) => run(() => setCardSprint(c.id, e.target.value || null, slug))}>
                        <option value="">Backlog</option>
                        {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "closed" ? " (closed)" : ""}</option>)}
                      </select>
                    ) : ((c.sprint_id && sprintName.get(c.sprint_id)) || <span className="admin-cell-muted">—</span>)}
                  </td>
                  <td className="u-right">
                    {canEdit ? (
                      <input
                        className="admin-input u-w-90"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="—"
                        aria-label="Human Tokens"
                        key={`${c.id}-${c.human_tokens ?? ""}`}
                        defaultValue={c.human_tokens ?? ""}
                        disabled={saving}
                        onBlur={(e) => saveTokens(c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (c.human_tokens ?? <span className="admin-cell-muted">—</span>)}
                  </td>
                  <td className={overdue ? "u-err" : undefined}>
                    {canEdit ? (
                      <input
                        className="admin-input u-w-160"
                        type="date"
                        aria-label="Due date"
                        value={c.due_date ?? ""}
                        disabled={saving}
                        onChange={(e) => run(() => updateCard(c.id, { dueDate: e.target.value || null }, slug))}
                      />
                    ) : (c.due_date ? formatDate(c.due_date) : "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
