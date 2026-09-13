"use client";

import { useMemo, useState } from "react";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";

// The workboard's filters and the cards that survive them. Client, person
// and status (the lane) are the three every surface shows; sprint and epic only mean something on
// a single board, so the toolbar offers them there alone, but the state lives
// here so the card form can preset a new card to the active sprint and epic.
export function useWorkboardFilters(data: WorkboardData, placement: Record<string, string>) {
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const activeSprints = useMemo(() => data.sprints.filter((s) => s.status === "active"), [data.sprints]);
  // Multi-value (Dave, 2026-09-07): empty = no filter; "internal" is a client value.
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [laneFilter, setLaneFilter] = useState<string[]>([]);
  const [sprintFilter, setSprintFilter] = useState<string>(single ? activeSprints[0]?.id ?? "all" : "all");
  const [epicFilter, setEpicFilter] = useState<string>("all");

  const firstLane = data.lanes[0]?.id ?? "";
  const boardClient = useMemo(
    () => new Map(data.boards.map((b) => [b.id, b.client_company_id])),
    [data.boards],
  );

  const cards: Card[] = useMemo(
    () =>
      data.cards
        .filter((c) => {
          if (clientFilter.length === 0) return true;
          const clientId = boardClient.get(c.board_id ?? "") ?? null;
          return clientFilter.includes(clientId ?? "internal");
        })
        .filter((c) => assigneeFilter.length === 0 || assigneeFilter.includes(c.assignee_id ?? "unassigned"))
        .filter((c) => laneFilter.length === 0 || laneFilter.includes(placement[c.id] ?? c.laneId ?? firstLane))
        .filter((c) =>
          sprintFilter === "all" ? true : sprintFilter === "backlog" ? c.sprint_id == null : c.sprint_id === sprintFilter,
        )
        .filter((c) => (epicFilter === "all" ? true : epicFilter === "none" ? c.epic_id == null : c.epic_id === epicFilter))
        .map((c) => ({ ...c, columnId: placement[c.id] ?? c.laneId ?? firstLane })),
    [data.cards, boardClient, clientFilter, assigneeFilter, laneFilter, sprintFilter, epicFilter, placement, firstLane],
  );

  const filtersActive =
    clientFilter.length > 0 || assigneeFilter.length > 0 || laneFilter.length > 0 || sprintFilter !== "all" || epicFilter !== "all";
  function clearFilters() {
    setClientFilter([]);
    setAssigneeFilter([]);
    setLaneFilter([]);
    setSprintFilter("all");
    setEpicFilter("all");
  }

  return {
    single,
    activeSprints,
    cards,
    clientFilter,
    setClientFilter,
    assigneeFilter,
    setAssigneeFilter,
    laneFilter,
    setLaneFilter,
    sprintFilter,
    setSprintFilter,
    epicFilter,
    setEpicFilter,
    filtersActive,
    clearFilters,
  };
}

export type WorkboardFilters = ReturnType<typeof useWorkboardFilters>;
