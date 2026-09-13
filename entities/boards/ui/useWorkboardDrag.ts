"use client";

import { useEffect, useMemo, useState } from "react";
import type { useRouter } from "next/navigation";
import type { MoveCard } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import { reorderCard } from "@/entities/boards/lib/reorder-actions";
import type { Card } from "./board-view-types";

// The board view's two drags, split out of Workboard.tsx for the file-size gate.
// `move` is a cross-lane drag (delegates to the injected onMove); `reorder` is a
// within-lane drag for priority (RE-01), persisted through reorderCard. It also
// owns the optimistic within-lane order overrides and the ordered card list the
// KanbanBoard renders: lanes keep their group order, and within a reordered lane
// cards follow the override (unlisted cards fall after, in original order).
export function useWorkboardDrag({
  data,
  cards,
  boardById,
  single,
  onMove,
  setPlacement,
  begin,
  end,
  setBanner,
  router,
}: {
  data: WorkboardData;
  cards: Card[];
  boardById: Map<string, WorkboardBoard>;
  single: WorkboardBoard | null;
  onMove: MoveCard;
  setPlacement: (fn: (p: Record<string, string>) => Record<string, string>) => void;
  begin: () => void;
  end: () => void;
  setBanner: (message: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [order, setOrder] = useState<Record<string, string[]>>({});
  useEffect(() => setOrder({}), [data.cards]);
  const laneById = useMemo(() => new Map(data.lanes.map((l) => [l.id, l])), [data.lanes]);

  const orderedCards = useMemo(() => {
    if (Object.keys(order).length === 0) return cards;
    const laneFirst = new Map<string, number>();
    cards.forEach((c, i) => {
      if (!laneFirst.has(c.columnId)) laneFirst.set(c.columnId, i);
    });
    return cards
      .map((c, i) => {
        const ids = order[c.columnId];
        const k = ids ? ids.indexOf(c.id) : -1;
        return { c, lane: laneFirst.get(c.columnId) ?? 0, rank: !ids ? i : k === -1 ? ids.length + i : k };
      })
      .sort((a, b) => a.lane - b.lane || a.rank - b.rank)
      .map((x) => x.c);
  }, [cards, order]);

  function move(cardId: string, laneId: string) {
    const card = data.cards.find((c) => c.id === cardId);
    const board = card ? boardById.get(card.board_id ?? "") : undefined;
    const toColumnId = board?.laneColumn[laneId];
    if (!card || !board || !toColumnId) {
      setBanner(`${board?.name ?? "That board"} has no "${laneId}" column.`);
      return;
    }
    setPlacement((p) => ({ ...p, [cardId]: laneId }));
    setBanner(null);
    begin();
    onMove(cardId, toColumnId, board.slug).then((r) => {
      if (!r.ok) setBanner(`Couldn't move card: ${r.error}`);
      end();
      router.refresh();
    });
  }

  // Drag a card up or down within its own lane for priority. The Done lane is
  // auto-sorted newest-first, so a manual rank there is ignored.
  function reorder(cardId: string, laneId: string, toIndex: number) {
    if (laneById.get(laneId)?.isDone) return;
    const laneIds = orderedCards.filter((c) => c.columnId === laneId).map((c) => c.id);
    const from = laneIds.indexOf(cardId);
    if (from === -1 || from === toIndex) return;
    laneIds.splice(from, 1);
    laneIds.splice(toIndex, 0, cardId);
    setOrder((o) => ({ ...o, [laneId]: laneIds }));
    const card = data.cards.find((c) => c.id === cardId);
    const board = card ? boardById.get(card.board_id ?? "") : undefined;
    setBanner(null);
    begin();
    reorderCard(cardId, laneIds, board?.slug ?? single?.slug ?? "").then((r) => {
      if (!r.ok) setBanner(`Couldn't reorder card: ${r.error}`);
      end();
      router.refresh();
    });
  }

  return { orderedCards, move, reorder };
}
