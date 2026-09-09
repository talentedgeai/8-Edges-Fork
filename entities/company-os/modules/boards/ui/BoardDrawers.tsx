"use client";

import type { BoardPerson } from "@/entities/company-os/modules/boards/data";
import type { WorkboardData, WorkboardBoard } from "@/entities/company-os/modules/boards/workboard";
import type { Card, RunAction } from "./board-view-types";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { SprintsDrawer } from "./SprintsDrawer";
import { EpicsDrawer } from "./EpicsDrawer";
import { BoardSettingsDrawer } from "./BoardSettingsDrawer";
import { ArchivedCardsDrawer } from "./ArchivedCardsDrawer";

export type BoardDrawer = "sprints" | "epics" | "archived" | "settings" | null;

// The board page's four drawers (sprints, epics, archived cards, settings),
// wired to one board. They only exist when a single board is in scope; the
// Workboard mounts this once it knows that (WB-01).
export function BoardDrawers({
  open,
  onClose,
  board,
  boardBase,
  data,
  f,
  cards,
  saving,
  run,
  onError,
  teamOptions,
  clientOptions,
  programOptions,
}: {
  open: BoardDrawer;
  onClose: () => void;
  board: WorkboardBoard;
  // Where this board's pages live (/admin or /team), for the sprint links.
  boardBase: string;
  data: WorkboardData;
  f: WorkboardFilters;
  cards: Card[];
  saving: boolean;
  run: RunAction;
  onError: (message: string | null) => void;
  teamOptions: BoardPerson[];
  clientOptions: { id: string; name: string }[];
  programOptions: { id: string; name: string; company_id: string }[];
}) {
  const slug = board.slug;
  return (
    <>
      <SprintsDrawer
        open={open === "sprints"}
        onClose={onClose}
        boardId={board.id}
        slug={slug}
        boardBase={boardBase}
        sprints={data.sprints}
        activeSprints={f.activeSprints}
        saving={saving}
        run={run}
        onError={onError}
        onClosed={(sprintId) => {
          if (f.sprintFilter === sprintId) f.setSprintFilter("all");
        }}
      />
      <EpicsDrawer
        open={open === "epics"}
        onClose={onClose}
        boardId={board.id}
        slug={slug}
        epics={data.epics}
        cards={cards}
        sourceCards={data.cards}
        saving={saving}
        run={run}
        onError={onError}
        onArchived={(epicId) => {
          if (f.epicFilter === epicId) f.setEpicFilter("all");
        }}
      />
      <BoardSettingsDrawer
        open={open === "settings"}
        onClose={onClose}
        board={board}
        slug={slug}
        members={data.members}
        teamOptions={teamOptions}
        clientOptions={clientOptions}
        programOptions={programOptions}
        saving={saving}
        run={run}
      />
      <ArchivedCardsDrawer open={open === "archived"} onClose={onClose} slug={slug} archivedCards={data.archivedCards} saving={saving} run={run} />
    </>
  );
}
