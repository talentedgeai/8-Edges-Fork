"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { boardFilterOptions } from "./board-filter";

// The workboard's filters and the cards that survive them. Client, person
// and status (the lane) are the three every surface shows; board joins them
// where a client in view has several (board-filter.ts); sprint and epic only mean something on
// a single board, so the toolbar offers them there alone, but the state lives
// here so the card form can preset a new card to the active sprint and epic.
// Across boards the sprint week (SW-01) takes the sprint filter's place: one
// key every board shares, so "everything in W38" is one pick.
export function useWorkboardFilters(data: WorkboardData, placement: Record<string, string>) {
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const activeSprints = useMemo(() => data.sprints.filter((s) => s.status === "active"), [data.sprints]);
  // Multi-value (Dave, 2026-09-07): empty = no filter; "internal" is a client value.
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [boardFilter, setBoardFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [laneFilter, setLaneFilter] = useState<string[]>([]);
  const [sprintFilter, setSprintFilter] = useState<string>(single ? activeSprints[0]?.id ?? "all" : "all");
  // The epics page links into the board with ?epic=<id> (or "none"); the URL
  // only seeds the filter, the toolbar owns it from there.
  const params = useSearchParams();
  const [epicFilter, setEpicFilter] = useState<string>(() => {
    const wanted = params.get("epic");
    if (!single || !wanted) return "all";
    return wanted === "none" || data.epics.some((e) => e.id === wanted) ? wanted : "all";
  });
  const [weekFilter, setWeekFilter] = useState<string>("all");
  // The weeks on offer, newest first, and each sprint's week for the card test.
  const weeks = useMemo(() => [...new Set(data.sprints.map((s) => s.week).filter((w): w is string => !!w))].sort((a, b) => b.localeCompare(a)), [data.sprints]);
  const sprintWeekById = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.week])), [data.sprints]);

  const boardOptions = useMemo(() => boardFilterOptions(data.boards, clientFilter), [data.boards, clientFilter]);
  // Choosing clients changes the boards on offer; a board chosen under a
  // client no longer in view drops with it, so nothing filters invisibly.
  function pickClients(next: string[]) {
    setClientFilter(next);
    const offered = new Set(boardFilterOptions(data.boards, next).map((o) => o.value));
    setBoardFilter((prev) => prev.filter((id) => offered.has(id)));
  }

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
        .filter((c) => boardFilter.length === 0 || boardFilter.includes(c.board_id ?? ""))
        .filter((c) => assigneeFilter.length === 0 || assigneeFilter.includes(c.assignee_id ?? "unassigned"))
        .filter((c) => laneFilter.length === 0 || laneFilter.includes(placement[c.id] ?? c.laneId ?? firstLane))
        .filter((c) =>
          sprintFilter === "all" ? true : sprintFilter === "backlog" ? c.sprint_id == null : c.sprint_id === sprintFilter,
        )
        .filter((c) => (epicFilter === "all" ? true : epicFilter === "none" ? c.epic_id == null : c.epic_id === epicFilter))
        .filter((c) => weekFilter === "all" || (c.sprint_id != null && sprintWeekById.get(c.sprint_id) === weekFilter))
        .map((c) => ({ ...c, columnId: placement[c.id] ?? c.laneId ?? firstLane })),
    [data.cards, boardClient, clientFilter, boardFilter, assigneeFilter, laneFilter, sprintFilter, epicFilter, weekFilter, sprintWeekById, placement, firstLane],
  );

  const filtersActive =
    clientFilter.length > 0 ||
    boardFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    laneFilter.length > 0 ||
    sprintFilter !== "all" ||
    epicFilter !== "all" ||
    weekFilter !== "all";
  function clearFilters() {
    setClientFilter([]);
    setBoardFilter([]);
    setAssigneeFilter([]);
    setLaneFilter([]);
    setSprintFilter("all");
    setEpicFilter("all");
    setWeekFilter("all");
  }

  return {
    single,
    activeSprints,
    cards,
    clientFilter,
    setClientFilter: pickClients,
    boardOptions,
    boardFilter,
    setBoardFilter,
    assigneeFilter,
    setAssigneeFilter,
    laneFilter,
    setLaneFilter,
    sprintFilter,
    setSprintFilter,
    epicFilter,
    setEpicFilter,
    weeks,
    weekFilter,
    setWeekFilter,
    filtersActive,
    clearFilters,
  };
}

export type WorkboardFilters = ReturnType<typeof useWorkboardFilters>;
