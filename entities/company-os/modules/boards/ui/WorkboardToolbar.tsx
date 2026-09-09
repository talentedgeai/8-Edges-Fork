"use client";

import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { MultiSelect } from "@/kernel/ui/MultiSelect";
import { AGING_DAYS } from "@/entities/company-os/modules/boards/types";
import type { WorkboardData } from "@/entities/company-os/modules/boards/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";

// The one toolbar: the filters (client, assignee, status, then a single
// board's sprint and epic), the board chips, then on the right the view
// toggle, the aging clock, Board settings and New card (new is always top right). A filter or button a surface
// cannot use is hidden, never rearranged (WB-01).
export function WorkboardToolbar({
  data,
  f,
  canAdd,
  extras,
  canManage,
  boardBase,
  totalCards,
  onNewCard,
  onOpen,
  view,
  onView,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  canAdd: boolean;
  extras: boolean;
  canManage: boolean;
  boardBase: string;
  totalCards: number;
  onNewCard: () => void;
  onOpen: (drawer: "sprints" | "epics" | "archived" | "settings") => void;
  view: "board" | "list";
  onView: (view: "board" | "list") => void;
}) {
  const { single } = f;
  const activeEpics = data.epics.filter((e) => e.status === "active");
  const hasInternal = data.boards.some((b) => b.client_company_id === null);
  return (
    <div className="admin-toolbar u-mb-3">
      {!single && (data.clients.length > 1 || (data.clients.length > 0 && hasInternal)) && (
        <MultiSelect
          label="Filter by client"
          noun="clients"
          options={[...data.clients.map((c) => ({ value: c.id, label: c.name })), ...(hasInternal ? [{ value: "internal", label: "Internal" }] : [])]}
          value={f.clientFilter}
          onChange={f.setClientFilter}
        />
      )}
      <MultiSelect
        label="Filter by assignee"
        noun="assignees"
        options={[...data.people.map((p) => ({ value: p.id, label: p.name })), { value: "unassigned", label: "Unassigned" }]}
        value={f.assigneeFilter}
        onChange={f.setAssigneeFilter}
      />
      <MultiSelect
        label="Filter by status"
        noun="statuses"
        options={data.lanes.map((l) => ({ value: l.id, label: l.name }))}
        value={f.laneFilter}
        onChange={f.setLaneFilter}
      />
      {single && data.sprints.length > 0 && (
        <select
          className={`admin-select admin-input--w-sm${f.sprintFilter !== "all" ? " is-filtering" : ""}`}
          value={f.sprintFilter}
          onChange={(e) => f.setSprintFilter(e.target.value)}
          aria-label="Filter by sprint"
        >
          <option value="all">All sprints</option>
          <option value="backlog">Backlog (no sprint)</option>
          {f.activeSprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {data.sprints
            .filter((s) => s.status === "closed")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (closed)
              </option>
            ))}
        </select>
      )}
      {single && extras && f.sprintFilter !== "all" && f.sprintFilter !== "backlog" && (
        <Link className="admin-btn admin-btn--sm" href={`${boardBase}/sprints/${f.sprintFilter}`}>
          View sprint
        </Link>
      )}
      {single && activeEpics.length > 0 && (
        <select
          className={`admin-select${f.epicFilter !== "all" ? " is-filtering" : ""} u-max-3`}
          value={f.epicFilter}
          onChange={(e) => f.setEpicFilter(e.target.value)}
          aria-label="Filter by epic"
        >
          <option value="all">All epics</option>
          <option value="none">No epic</option>
          {activeEpics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
      {f.filtersActive && (
        <>
          <span className="admin-cell-muted u-sm">
            {f.cards.length} of {totalCards} cards
          </span>
          <button className="admin-btn admin-btn--sm" onClick={f.clearFilters}>
            ✕ Clear filters
          </button>
        </>
      )}
      {single?.program_name && <Badge tone="info">{single.program_name}</Badge>}
      {single && extras && (
        <>
          <button className="admin-btn admin-btn--sm" onClick={() => onOpen("sprints")}>
            Sprints
          </button>
          <button className="admin-btn admin-btn--sm" onClick={() => onOpen("epics")}>
            Epics{data.epics.length > 0 ? ` (${activeEpics.length})` : ""}
          </button>
          {data.archivedCards.length > 0 && (
            <button className="admin-btn admin-btn--sm" onClick={() => onOpen("archived")}>
              Archived ({data.archivedCards.length})
            </button>
          )}
        </>
      )}
      <div className="admin-viewtoggle u-ml-auto" role="group" aria-label="Workboard view">
        <button type="button" className={view === "board" ? "is-active" : ""} onClick={() => onView("board")}>
          Board
        </button>
        <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => onView("list")}>
          List
        </button>
      </div>
      <span
        className="admin-cell-muted u-sm"
        style={{ cursor: "help" }} /* layout-ok: cursor hint only, no utility class */
        title={`Amber clock = in column more than ${AGING_DAYS} days`}
      >
        ◷ &gt;{AGING_DAYS}d
      </span>
      {single && extras && canManage && (
        <button className="admin-btn admin-btn--sm" onClick={() => onOpen("settings")}>
          ⚙ Board settings
        </button>
      )}
      {canAdd && (
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={onNewCard}>
          New card
        </button>
      )}
    </div>
  );
}
