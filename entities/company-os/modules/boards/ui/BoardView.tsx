"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import {
  STAGE_WON,
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_PROPOSAL,
  STAGE_DISCOVERY,
  STAGE_CONTRACT,
} from "@/entities/company-os/lib/stageColors";
import { AGING_DAYS, NEW_ASSIGNMENT_DAYS, PRIORITY_LABEL, PRIORITY_TONE, TASK_PRIORITIES, SUBJECT_COMMITMENT, SUBJECT_BACKLOG_ITEM, assignedAt, daysInColumn, epicColorIndex, initials, type MoveCard } from "@/entities/company-os/modules/boards/types";
import type { BoardDetail, BoardPerson } from "@/entities/company-os/modules/boards/data";
import { type Card, type RunAction } from "./board-view-types";
import { useCardForm } from "./useCardForm";
import { CardDrawer } from "./CardDrawer";
import { SprintsDrawer } from "./SprintsDrawer";
import { EpicsDrawer } from "./EpicsDrawer";
import { BoardSettingsDrawer } from "./BoardSettingsDrawer";
import { ArchivedCardsDrawer } from "./ArchivedCardsDrawer";

const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];

export function BoardView({
  detail,
  onMove,
  canManage = false,
  teamOptions = [],
  clientOptions = [],
  programOptions = [],
  viewerPersonId = null,
}: {
  detail: BoardDetail;
  onMove: MoveCard;
  canManage?: boolean;
  teamOptions?: BoardPerson[];
  clientOptions?: { id: string; name: string }[];
  // All AI Programs with their owning company; the settings picker shows the
  // ones belonging to the selected client. Empty = picker hidden.
  programOptions?: { id: string; name: string; company_id: string }[];
  viewerPersonId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { board, columns, members, cards: sourceCards, sprints, epics, backlogItems, backlogGroups, archivedCards } = detail;
  const slug = board.slug;
  // This view renders under both /admin/boards and /team/boards; sprint links stay in-section.
  const boardBase = pathname?.startsWith("/team/") ? `/team/boards/${slug}` : `/admin/boards/${slug}`;
  const isClientBoard = board.client_company_id != null;

  const activeSprints = useMemo(() => sprints.filter((s) => s.status === "active"), [sprints]);
  const sprintName = useMemo(() => new Map(sprints.map((s) => [s.id, s.name])), [sprints]);

  const activeEpics = useMemo(() => epics.filter((e) => e.status === "active"), [epics]);
  const epicById = useMemo(() => new Map(epics.map((e) => [e.id, e])), [epics]);

  // Optimistic column overrides layered on the server's `board_column_id`. The
  // server value is rebuilt per `sourceCards` identity, so once a router.refresh()
  // delivers fresh cards (and no move is in flight) the overrides drop and the
  // server's placement shows through — a failed move refreshes rather than restoring a snapshot.
  const serverPlacement = useMemo<Record<string, string>>(
    () => Object.fromEntries(sourceCards.flatMap((c) => (c.board_column_id ? [[c.id, c.board_column_id]] : []))), [sourceCards]);
  const [placement, setPlacement, { pending: inFlight, begin, end }] = useServerSyncedState(serverPlacement);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState<string>(activeSprints[0]?.id ?? "all");
  const [epicFilter, setEpicFilter] = useState<string>("all");
  const [banner, setBanner] = useState<string | null>(null);
  const [sprintsOpen, setSprintsOpen] = useState(false);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  // Board page tabs: Stories = the kanban of cards, Sprints = the sprint list
  // with plan-vs-actual counts linking into each sprint's detail page.
  const [tab, setTab] = useState<"stories" | "sprints">("stories");
  const [saving, startSaving] = useTransition();

  // One path for every drawer's server action: clear the banner, run it in the
  // transition, show the error or refresh so the server's truth shows through.
  const run: RunAction = (fn, onOk) => {
    setBanner(null);
    startSaving(async () => {
      const r = await fn();
      if (!r.ok) return setBanner(r.error);
      onOk?.();
      router.refresh();
    });
  };

  const { form, setForm, openCard, openCreate, save, archive } = useCardForm({
    board,
    slug,
    isClientBoard,
    sprintFilter,
    epicFilter,
    setBanner,
    router,
    startSaving,
  });

  const activeCard = form?.id ? sourceCards.find((c) => c.id === form.id) ?? null : null;

  const firstColumn = columns[0]?.id ?? "";

  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    let nd = 0;
    return columns.map((c) => ({
      id: c.id,
      label: c.name,
      accent: c.is_done ? STAGE_WON : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length],
    }));
  }, [columns]);

  const cards: Card[] = useMemo(() => {
    return sourceCards
      .filter((c) => !assigneeFilter || c.assignee_id === assigneeFilter)
      .filter((c) => !priorityFilter || c.priority === priorityFilter)
      .filter((c) =>
        sprintFilter === "all"
          ? true
          : sprintFilter === "backlog"
            ? c.sprint_id == null
            : c.sprint_id === sprintFilter,
      )
      .filter((c) =>
        epicFilter === "all" ? true : epicFilter === "none" ? c.epic_id == null : c.epic_id === epicFilter,
      )
      .map((c) => ({ ...c, columnId: placement[c.id] ?? c.board_column_id ?? firstColumn }));
  }, [sourceCards, assigneeFilter, priorityFilter, sprintFilter, epicFilter, placement, firstColumn]);

  const assigneeOptions = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.name]));
    for (const c of sourceCards) {
      if (c.assignee_id && c.assignee_name && !map.has(c.assignee_id)) map.set(c.assignee_id, c.assignee_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [members, sourceCards]);

  function move(cardId: string, toColumnId: string) {
    setPlacement((p) => ({ ...p, [cardId]: toColumnId }));
    setBanner(null);
    begin();
    onMove(cardId, toColumnId, slug).then((r) => {
      if (!r.ok) setBanner(`Couldn't move card: ${r.error}`);
      end();
      router.refresh();
    });
  }

  const columnName = (id: string) => columns.find((c) => c.id === id)?.name ?? "—";

  const filtersActive =
    assigneeFilter !== "" || priorityFilter !== "" || sprintFilter !== "all" || epicFilter !== "all";
  function clearFilters() {
    setAssigneeFilter("");
    setPriorityFilter("");
    setSprintFilter("all");
    setEpicFilter("all");
  }

  function isNewForViewer(c: Card): boolean {
    if (!viewerPersonId || c.assignee_id !== viewerPersonId || c.status === "done") return false;
    return Date.now() - new Date(assignedAt(c)).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
  }

  return (
    <>
      <div className="admin-tabs u-mb-3" role="tablist">
        <button
          className={`admin-tab${tab === "stories" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "stories"}
          onClick={() => setTab("stories")}
        >
          Stories
        </button>
        <button
          className={`admin-tab${tab === "sprints" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "sprints"}
          onClick={() => setTab("sprints")}
        >
          Sprints{sprints.length > 0 ? ` (${sprints.length})` : ""}
        </button>
      </div>

      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}

      {tab === "sprints" && (
        <div className="u-stack u-gap-3">
          {sprints.length === 0 && (
            <div className="admin-cell-muted u-sm">
              No sprints yet. Create one with Manage sprints.
            </div>
          )}
          {[...sprints]
            .sort((a, b) => (a.status === b.status ? a.sort_order - b.sort_order : a.status === "active" ? -1 : 1))
            .map((s) => {
              const inSprint = sourceCards.filter((c) => c.sprint_id === s.id);
              const doneCards = inSprint.filter((c) => c.status === "done");
              const totalHT = inSprint.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
              const doneHT = doneCards.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
              const pct = inSprint.length ? Math.round((doneCards.length / inSprint.length) * 100) : 0;
              return (
                <Link
                  key={s.id}
                  href={`${boardBase}/sprints/${s.id}`}
                  className="admin-card admin-sprint-card u-link-plain"
                >
                  <div className="u-row u-wrap">
                    <span className="admin-cell-strong">{s.name}</span>
                    <Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</Badge>
                    {(s.starts_on || s.ends_on) && (
                      <span className="admin-cell-muted u-sm">
                        {s.starts_on ? formatDate(s.starts_on) : "?"} to {s.ends_on ? formatDate(s.ends_on) : "?"}
                      </span>
                    )}
                    <span className="admin-cell-muted u-ml-auto u-sm">
                      {doneCards.length}/{inSprint.length} cards
                      {totalHT > 0 ? ` · ${doneHT}/${totalHT} HT` : ""}
                    </span>
                  </div>
                  {s.goal && (
                    <div className="admin-cell-muted u-sm u-mt-1">
                      {s.goal}
                    </div>
                  )}
                  <div className="admin-meter admin-meter--thin u-mt-2">
                    <div className="admin-meter-fill" style={{ width: `${pct}%` }} /* layout-ok: data-driven progress width */ />
                  </div>
                </Link>
              );
            })}
          <div>
            <button className="admin-btn admin-btn--sm" onClick={() => setSprintsOpen(true)}>
              Manage sprints
            </button>
          </div>
        </div>
      )}

      {tab === "stories" && (
      <>
      <div className="admin-toolbar u-mb-3">
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => openCreate(firstColumn)}>
          New card
        </button>
        {sprints.length > 0 && (
          <select
            className={`admin-select admin-input--w-sm${sprintFilter !== "all" ? " is-filtering" : ""}`}
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            aria-label="Filter by sprint"
          >
            <option value="all">All sprints</option>
            <option value="backlog">Backlog (no sprint)</option>
            {activeSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {sprints
              .filter((s) => s.status === "closed")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (closed)
                </option>
              ))}
          </select>
        )}
        {sprintFilter !== "all" && sprintFilter !== "backlog" && (
          <Link className="admin-btn admin-btn--sm" href={`${boardBase}/sprints/${sprintFilter}`}>
            View sprint
          </Link>
        )}
        <select
          className={`admin-select admin-input--w-sm${assigneeFilter ? " is-filtering" : ""}`}
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          {assigneeOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className={`admin-select admin-input--w-sm${priorityFilter ? " is-filtering" : ""}`}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {activeEpics.length > 0 && (
          <select
            className={`admin-select${epicFilter !== "all" ? " is-filtering" : ""} u-max-3`}
            value={epicFilter}
            onChange={(e) => setEpicFilter(e.target.value)}
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
        {filtersActive && (
          <>
            <span className="admin-cell-muted u-sm">
              {cards.length} of {sourceCards.length} cards
            </span>
            <button className="admin-btn admin-btn--sm" onClick={clearFilters}>
              ✕ Clear filters
            </button>
          </>
        )}
        {board.program_name && <Badge tone="info">{board.program_name}</Badge>}
        <button className="admin-btn admin-btn--sm" onClick={() => setSprintsOpen(true)}>
          Sprints
        </button>
        <button className="admin-btn admin-btn--sm" onClick={() => setEpicsOpen(true)}>
          Epics{epics.length > 0 ? ` (${activeEpics.length})` : ""}
        </button>
        {archivedCards.length > 0 && (
          <button className="admin-btn admin-btn--sm" onClick={() => setArchivedOpen(true)}>
            Archived ({archivedCards.length})
          </button>
        )}
        <span
          className="admin-cell-muted u-ml-auto u-sm"
          style={{ cursor: "help" }} /* layout-ok: cursor hint only, no utility class */
          title={`Amber clock = in column more than ${AGING_DAYS} days`}
        >
          ◷ &gt;{AGING_DAYS}d
        </span>
        {canManage && (
          <button className="admin-btn admin-btn--sm" onClick={() => setSettingsOpen(true)}>
            ⚙ Board settings
          </button>
        )}
      </div>

      <KanbanBoard<Card>
        columns={kanbanColumns}
        cards={cards}
        disabled={inFlight > 0}
        onMove={move}
        onCardClick={openCard}
        columnFooter={(col) => (
          <button className="admin-kanban-add" onClick={() => openCreate(col.id)}>
            + Add a card
          </button>
        )}
        cardClassName={(c) => (isNewForViewer(c) ? "is-new" : undefined)}
        renderCard={(c) => {
          const days = daysInColumn(c.last_moved_at);
          const aging = days >= AGING_DAYS && c.status !== "done";
          const overdue =
            c.due_date != null && c.status !== "done" && c.due_date < new Date().toISOString().slice(0, 10);
          return (
            <>
              <div className="admin-kanban-card-title">{c.title}</div>
              <div className="admin-kanban-card-meta">
                {isNewForViewer(c) && <Badge tone="info">New</Badge>}
                <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
                {c.epic_id &&
                  epicById.get(c.epic_id) &&
                  (() => {
                    const e = epicById.get(c.epic_id!)!;
                    return (
                      <span className="admin-board-epic-chip" title={`Epic: ${e.name}`}>
                        <span className="admin-board-epic-dot" data-epic-color={epicColorIndex(e.color)} />
                        {e.name}
                      </span>
                    );
                  })()}
                {c.subject_type === SUBJECT_COMMITMENT && <Badge tone="ok">Commitment</Badge>}
                {c.subject_type === SUBJECT_BACKLOG_ITEM && <Badge tone="info">Roadmap</Badge>}
                {c.agent && <Badge tone="neutral">Agent</Badge>}
                {c.sprint_id && c.sprint_id !== sprintFilter && sprintName.get(c.sprint_id) && (
                  <Badge tone="info">{sprintName.get(c.sprint_id)}</Badge>
                )}
                {c.internal && <Badge tone="neutral">Internal</Badge>}
              </div>
              <div className="admin-kanban-card-meta">
                {c.assignee_name ? (
                  <span className="admin-kanban-card-assignee">
                    <span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(c.assignee_name)}</span>
                    {c.assignee_name}
                  </span>
                ) : (
                  <span className="admin-kanban-card-sub">Unassigned</span>
                )}
                {c.due_date && (
                  <span
                    className={`admin-kanban-card-sub u-ml-auto${overdue ? " u-err" : ""}`}
                  >
                    {formatDate(c.due_date)}
                  </span>
                )}
              </div>
              {(c.subtasks.length > 0 || c.comments.length > 0 || c.human_tokens != null) && (
                <div className="admin-kanban-card-sub u-row u-gap-3 u-mt-1">
                  {c.subtasks.length > 0 && (
                    <span>
                      ☑ {c.subtasks.filter((s) => s.done).length}/{c.subtasks.length}
                    </span>
                  )}
                  {c.comments.length > 0 && <span>💬 {c.comments.length}</span>}
                  {c.human_tokens != null && <span title="Human Tokens">⚡ {c.human_tokens} HT</span>}
                </div>
              )}
              {aging && (
                <div className="admin-kanban-card-sub u-warn u-mt-1">
                  ◷ {days}d in column
                </div>
              )}
            </>
          );
        }}
      />
      </>
      )}

      <CardDrawer
        form={form}
        setForm={setForm}
        activeCard={activeCard}
        currentColumnId={form?.id ? placement[form.id] : undefined}
        columns={columns}
        kanbanColumns={kanbanColumns}
        assigneeOptions={assigneeOptions}
        activeSprints={activeSprints}
        activeEpics={activeEpics}
        epicById={epicById}
        isClientBoard={isClientBoard}
        backlogItems={backlogItems}
        backlogGroups={backlogGroups}
        slug={slug}
        saving={saving}
        run={run}
        onMoveColumn={move}
        onSave={save}
        onArchive={archive}
      />

      <SprintsDrawer
        open={sprintsOpen}
        onClose={() => setSprintsOpen(false)}
        boardId={board.id}
        slug={slug}
        boardBase={boardBase}
        sprints={sprints}
        activeSprints={activeSprints}
        saving={saving}
        run={run}
        onError={setBanner}
        onClosed={(sprintId) => {
          if (sprintFilter === sprintId) setSprintFilter("all");
        }}
      />

      <EpicsDrawer
        open={epicsOpen}
        onClose={() => setEpicsOpen(false)}
        boardId={board.id}
        slug={slug}
        epics={epics}
        cards={cards}
        sourceCards={sourceCards}
        saving={saving}
        run={run}
        onError={setBanner}
        onArchived={(epicId) => {
          if (epicFilter === epicId) setEpicFilter("all");
        }}
      />

      <BoardSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        board={board}
        slug={slug}
        members={members}
        teamOptions={teamOptions}
        clientOptions={clientOptions}
        programOptions={programOptions}
        saving={saving}
        run={run}
      />

      <ArchivedCardsDrawer
        open={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        slug={slug}
        archivedCards={archivedCards}
        saving={saving}
        run={run}
      />
    </>
  );
}
