"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard } from "@/kernel/ui/KanbanBoard";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import type { MoveCard, TaskPriority } from "@/entities/company-os";
import type { MyWorkBoard as MyWorkBoardData, MyWorkCard } from "@/entities/team/lib/boards";

const ALL = "all";
const INTERNAL = "internal";

// One board for everything assigned to the member, across every board they
// sit on. Every board shares the same four columns, so the lanes are those
// column names and a drag lands the card in the same-named column on its own
// board. `onMove` is team's shared moveCard server action (company-os owns only the
// MoveCard contract since Q2) and the two
// maps are its priority vocabulary; the page passes them because this is a
// client component and the company-os door is a server-only barrel (ME-11).
export function MyWorkBoard({
  data,
  onMove,
  priorityLabel,
  priorityTone,
}: {
  data: MyWorkBoardData;
  onMove: MoveCard;
  priorityLabel: Record<TaskPriority, string>;
  priorityTone: Record<TaskPriority, BadgeTone>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cards, setCards] = useServerSyncedState<MyWorkCard[]>(data.cards);
  const [client, setClient] = useState<string>(ALL);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = useMemo(
    () => data.lanes.map((l) => ({ id: l.name, label: l.name, accent: l.accent })),
    [data.lanes],
  );

  const visible = useMemo(() => {
    if (client === ALL) return cards;
    return cards.filter((c) => {
      const clientId = data.boards[c.boardId]?.clientId ?? null;
      return client === INTERNAL ? clientId === null : clientId === client;
    });
  }, [cards, client, data.boards]);

  const hasInternal = cards.some((c) => (data.boards[c.boardId]?.clientId ?? null) === null);
  const today = new Date().toISOString().slice(0, 10);

  function move(cardId: string, lane: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.columnId === lane) return;
    const board = data.boards[card.boardId];
    const toColumnId = board?.columns[lane];
    if (!board || !toColumnId) {
      setBanner(`${board?.name ?? "That board"} has no "${lane}" column.`);
      return;
    }
    setBanner(null);
    setBusy(true);
    const prev = cards;
    setCards(prev.map((c) => (c.id === cardId ? { ...c, columnId: lane } : c)));
    onMove(cardId, toColumnId, board.slug).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setCards(prev);
        setBanner(r.error);
        return;
      }
      startTransition(() => router.refresh());
    });
  }

  return (
    <>
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}

      <div className="admin-toolbar u-mb-3">
        <select
          className={`admin-select admin-input--w-sm${client !== ALL ? " is-filtering" : ""}`}
          value={client}
          onChange={(e) => setClient(e.target.value)}
          aria-label="Filter by client"
        >
          <option value={ALL}>All clients</option>
          {data.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {hasInternal && <option value={INTERNAL}>Internal</option>}
        </select>
        <span className="admin-cell-muted u-ml-auto u-sm">
          {visible.length} {visible.length === 1 ? "card" : "cards"}
        </span>
      </div>

      <KanbanBoard
        columns={columns}
        cards={visible}
        onMove={move}
        onCardClick={(c) => router.push(`/team/boards/${data.boards[c.boardId]?.slug ?? ""}`)}
        disabled={busy}
        renderCard={(c) => {
          const board = data.boards[c.boardId];
          const overdue = c.dueDate != null && c.status !== "done" && c.dueDate < today;
          return (
            <>
              <div className="admin-kanban-card-title">{c.title}</div>
              <div className="admin-kanban-card-meta">
                <Badge tone={priorityTone[c.priority]}>{priorityLabel[c.priority]}</Badge>
                {board?.clientName ? <Badge tone="info">{board.clientName}</Badge> : <Badge tone="neutral">Internal</Badge>}
              </div>
              <div className="admin-kanban-card-meta">
                <span className="admin-kanban-card-sub">{board?.name}</span>
                {c.dueDate && (
                  <span className={`admin-kanban-card-sub u-ml-auto${overdue ? " u-err" : ""}`}>{formatDate(c.dueDate)}</span>
                )}
              </div>
            </>
          );
        }}
      />
    </>
  );
}
