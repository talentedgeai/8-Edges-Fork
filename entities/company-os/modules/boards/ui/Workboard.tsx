"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import { STAGE_WON, STAGE_LEAD, STAGE_NEUTRAL, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT } from "@/entities/company-os/lib/stageColors";
import type { MoveCard } from "@/entities/company-os/modules/boards/types";
import type { BoardPerson } from "@/entities/company-os/modules/boards/data";
import type { WorkboardData } from "@/entities/company-os/modules/boards/workboard";
import { cardSlug } from "@/entities/company-os/lib/slug";
import { type Card, type RunAction } from "./board-view-types";
import { useWorkboardFilters } from "./useWorkboardFilters";
import { useWorkboardDrag } from "./useWorkboardDrag";
import { useCardDeepLink } from "./useCardDeepLink";
import { useCardForm } from "./useCardForm";
import { WorkboardToolbar } from "./WorkboardToolbar";
import { WorkboardCard, isNewForViewer } from "./WorkboardCard";
import { SprintsTab } from "./SprintsTab";
import { CardDrawer } from "./CardDrawer";
import { WorkboardList } from "./WorkboardList";
import { BoardDrawers, type BoardDrawer } from "./BoardDrawers";

const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];
// Board or list, remembered per browser (WB-03). Board on first paint so the
// server and client render agree; the stored choice applies after mount.
const VIEW_KEY = "workboard:view";
export type WorkboardView = "board" | "list";

// The one workboard (WB-01). Every surface that shows cards renders this:
// the admin and team board pages, the hub tabs, My Work, the Company
// Dashboard and the client portal. What differs between them is the data's
// scope and the switches below, never the look. `onMove` is team's moveCard
// (company-os owns only the contract, Q2), handed in by the page because this
// is a client component and the company-os door is server-only.
export function Workboard({
  data,
  onMove,
  viewerPersonId = null,
  canMove = true,
  canAdd = true,
  canEdit = true,
  extras = false,
  canManage = false,
  teamOptions = [],
  clientOptions = [],
  programOptions = [],
}: {
  data: WorkboardData;
  onMove: MoveCard;
  viewerPersonId?: string | null;
  // Drag between lanes: everything, only the viewer's own cards, or nothing.
  canMove?: boolean | "own";
  canAdd?: boolean;
  canEdit?: boolean;
  // The board page's chrome: the Sprints tab and the sprint, epic, archived
  // and settings drawers. Only meaningful with one board in scope.
  extras?: boolean;
  canManage?: boolean;
  teamOptions?: BoardPerson[];
  clientOptions?: { id: string; name: string }[];
  programOptions?: { id: string; name: string; company_id: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Board links stay in-section: this renders under /admin, /team and /portal.
  const section = pathname?.startsWith("/team/") ? "/team" : "/admin";
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const boardById = useMemo(() => new Map(data.boards.map((b) => [b.id, b])), [data.boards]);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name])), [data.sprints]);
  const epicById = useMemo(() => new Map(data.epics.map((e) => [e.id, e])), [data.epics]);

  // Optimistic lane overrides layered on the server's laneId. The server value
  // is rebuilt per `data.cards` identity, so once a router.refresh() delivers
  // fresh cards (and no move is in flight) the overrides drop and the server's
  // placement shows through; a failed move refreshes rather than restoring a snapshot.
  const serverPlacement = useMemo<Record<string, string>>(
    () => Object.fromEntries(data.cards.map((c) => [c.id, c.laneId])),
    [data.cards],
  );
  const [placement, setPlacement, { pending: inFlight, begin, end }] = useServerSyncedState(serverPlacement);
  const f = useWorkboardFilters(data, placement);
  const [banner, setBanner] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<BoardDrawer>(null);
  const [tab, setTab] = useState<"stories" | "sprints">("stories");
  const [view, setView] = useState<WorkboardView>("board");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      // Storage may be unavailable; the board view is the fallback.
    }
  }, []);
  function pickView(v: WorkboardView) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Same: a preference that cannot be stored is still applied for this page.
    }
  }
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
    data,
    sprintFilter: f.sprintFilter,
    epicFilter: f.epicFilter,
    setBanner,
    router,
    startSaving,
  });
  const activeCard = form?.id ? data.cards.find((c) => c.id === form.id) ?? null : null;
  const firstLane = data.lanes[0]?.id ?? "";

  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    let nd = 0;
    return data.lanes.map((l) => ({ id: l.id, label: l.name, accent: l.isDone ? STAGE_WON : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length] }));
  }, [data.lanes]);

  const mayMove = (c: Card) => (canMove === "own" ? c.assignee_id === viewerPersonId : canMove);

  const { orderedCards, move, reorder } = useWorkboardDrag({
    data,
    cards: f.cards,
    boardById,
    single,
    onMove,
    setPlacement,
    begin,
    end,
    setBanner,
    router,
  });

  const showSprintsTab = extras && single !== null;
  const boardBase = single ? `${section}/boards/${single.slug}` : "";
  const activeBoard = activeCard ? boardById.get(activeCard.board_id ?? "") : undefined;
  // A card's own shareable link (CU-01): the card's board page with a friendly
  // ?card=<name-shortcode> slug, so a reviewer who opens it lands with the
  // card's drawer open. The same slug is mirrored into the address bar on open.
  const activeCardSlug = activeCard ? cardSlug(activeCard.title, activeCard.id) : null;
  const shareUrl = activeCard && activeBoard ? `${section}/boards/${activeBoard.slug}?card=${activeCardSlug}` : null;
  useCardDeepLink(data.cards, openCard, activeCardSlug);

  return (
    <>
      {showSprintsTab && (
        <div className="admin-tabs u-mb-3" role="tablist">
          {(["stories", "sprints"] as const).map((t) => (
            <button key={t} className={`admin-tab${tab === t ? " is-active" : ""}`} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "stories" ? "Stories" : `Sprints${data.sprints.length > 0 ? ` (${data.sprints.length})` : ""}`}
            </button>
          ))}
        </div>
      )}

      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}

      {showSprintsTab && tab === "sprints" && <SprintsTab data={data} boardBase={boardBase} onManage={() => setDrawer("sprints")} />}

      {tab === "stories" && (
        <>
          <WorkboardToolbar
            data={data}
            f={f}
            canAdd={canAdd}
            extras={extras}
            canManage={canManage}
            boardBase={boardBase}
            totalCards={data.cards.length}
            onNewCard={() => openCreate(firstLane)}
            onOpen={setDrawer}
            view={view}
            onView={pickView}
          />
          {view === "list" ? (
            <WorkboardList data={data} cards={f.cards} canEdit={canEdit} saving={saving} run={run} onOpen={openCard} onMoveLane={move} />
          ) : (
          <KanbanBoard<Card>
            columns={kanbanColumns}
            cards={orderedCards}
            disabled={inFlight > 0 || canMove === false}
            isDragDisabled={(c) => !mayMove(c)}
            onMove={move}
            onReorder={reorder}
            onCardClick={openCard}
            columnFooter={canAdd ? (col) => (
              <button className="admin-kanban-add" onClick={() => openCreate(col.id)}>
                + Add a card
              </button>
            ) : undefined}
            cardClassName={(c) => (isNewForViewer(c, viewerPersonId) ? "is-new" : undefined)}
            renderCard={(c) => (
              <WorkboardCard card={c} board={boardById.get(c.board_id ?? "")} showBoard={!single} viewerPersonId={viewerPersonId} sprintFilter={f.sprintFilter} sprintName={sprintName} epicById={epicById} />
            )}
          />
          )}
        </>
      )}

      <CardDrawer
        form={form}
        setForm={setForm}
        data={data}
        activeCard={activeCard}
        lanes={data.lanes}
        currentLaneId={form?.id ? placement[form.id] : undefined}
        readOnly={!canEdit}
        shareUrl={shareUrl}
        boardHref={!single && activeBoard && canEdit ? `${section}/boards/${activeBoard.slug}` : null}
        saving={saving}
        run={run}
        onMoveLane={move}
        onSave={save}
        onArchive={archive}
      />

      {extras && single && (
        <BoardDrawers
          open={drawer}
          onClose={() => setDrawer(null)}
          board={single}
          boardBase={boardBase}
          data={data}
          f={f}
          cards={f.cards}
          saving={saving}
          run={run}
          onError={setBanner}
          teamOptions={teamOptions}
          clientOptions={clientOptions}
          programOptions={programOptions}
        />
      )}
    </>
  );
}
