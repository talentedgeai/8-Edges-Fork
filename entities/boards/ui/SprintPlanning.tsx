"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import { MultiSelect } from "@/kernel/ui/MultiSelect";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { addDays } from "@/kernel/config/dates";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON } from "@/kernel/ui/stageColors";
import { PRIORITY_LABEL, PRIORITY_TONE, initials } from "@/entities/boards/lib/types";
import type { WorkboardCard, WorkboardData } from "@/entities/boards/lib/workboard";
import { SPRINT_CHATS, type SprintChat } from "@/entities/boards/lib/sprint-cadence";
import { weekShort, weekWindow } from "@/entities/boards/lib/sprint-cadence";
import { PLANNING_COLUMNS, doneWindow, isCarried, planningBoards, planningColumn, planningWeeks, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { setCardSprint } from "@/entities/boards/lib/actions";
import { moveCardColumn } from "@/entities/boards/lib/move-card";
import { SprintPlanningNext } from "./SprintPlanningNext";
import type { RunAction } from "./board-view-types";

type Card = WorkboardCard & { columnId: string; pb: PlanningBoard };

const ACCENT: Record<string, string> = { open: STAGE_NEUTRAL, next: STAGE_LEAD, done: STAGE_WON };

// Sprint planning (SP-01): three columns for the Monday-to-Tuesday meeting.
// Everything not done on the left, next week's sprint per board in the
// middle, this week's finished cards on the right. Dragging into the middle
// commits a card to its own board's next sprint (a card can never land in
// another client's sprint); dragging right closes it; dragging back left
// uncommits or reopens it. The columns are lib/sprint-planning's rule; this
// file is the drag and the filters. Rendered on /admin and /team alike.
// The week picker (SW-01) reads a past planning back: newest week first, and
// the newest is the live one.
export function SprintPlanning({ data, today, canEdit = true }: { data: WorkboardData; today: string; canEdit?: boolean }) {
  const router = useRouter();
  const section = usePathname()?.startsWith("/team") ? "/team" : "/admin";
  const weeks = useMemo(() => planningWeeks(data), [data]);
  const [week, setWeek] = useState<string>(weeks[0] ?? "");
  // The live week is the newest one, planned the usual way; any other is history.
  const chosenWeek = week && week !== weeks[0] ? week : null;
  const { since, until } = doneWindow(chosenWeek, today);
  const boards = useMemo(() => planningBoards(data, chosenWeek), [data, chosenWeek]);
  const teams = SPRINT_CHATS.filter((c) => boards.some((b) => b.chat === c.key));
  const [team, setTeam] = useState<SprintChat | "">(teams[0]?.key ?? "");
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const inView = boards.filter((b) => (!team || b.chat === team) && (clientFilter.length === 0 || clientFilter.includes(b.board.client_company_id ?? "internal")));
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of boards.filter((b) => !team || b.chat === team)) seen.set(b.board.client_company_id ?? "internal", b.board.client_name ?? "Internal");
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [boards, team]);
  const boardsPerClient = new Map<string, number>();
  for (const b of inView) boardsPerClient.set(b.board.client_company_id ?? "", (boardsPerClient.get(b.board.client_company_id ?? "") ?? 0) + 1);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name])), [data.sprints]);

  const serverPlacement = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const pb of boards) {
      for (const c of data.cards) {
        if (c.board_id !== pb.board.id) continue;
        const col = planningColumn(c, pb, since, until);
        if (col) out[c.id] = col;
      }
    }
    return out;
  }, [boards, data.cards, since, until]);
  const [placement, setPlacement, { pending, begin, end }] = useServerSyncedState(serverPlacement);

  const cards: Card[] = useMemo(() => {
    const pbById = new Map(inView.map((pb) => [pb.board.id, pb]));
    return data.cards
      .filter((c) => placement[c.id] && pbById.has(c.board_id ?? ""))
      .map((c) => ({ ...c, columnId: placement[c.id], pb: pbById.get(c.board_id ?? "")! }))
      .sort((a, b) => (a.pb.board.client_name ?? "").localeCompare(b.pb.board.client_name ?? "") || a.pb.board.name.localeCompare(b.pb.board.name) || a.created_at.localeCompare(b.created_at));
  }, [data.cards, inView, placement]);

  const run: RunAction = (fn, onOk) => {
    setBanner(null);
    startSaving(async () => {
      const r = await fn();
      if (!r.ok) return setBanner(r.error);
      onOk?.();
      router.refresh();
    });
  };

  function move(cardId: string, to: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const { board, next } = card.pb;
    // A locked sprint's commitments change only after an explicit Unlock (SW-01).
    if (next?.locked_at && (to === "next" || card.columnId === "next")) {
      return setBanner(`${next.name} is locked. Unlock it above to change what is committed.`);
    }
    let write: Promise<{ ok: true } | { ok: false; error: string }>;
    if (to === "next") {
      if (!next) return setBanner(`${board.name} has no next sprint yet; the Monday routine opens one.`);
      write = setCardSprint(cardId, next.id, board.slug);
    } else if (to === "done") {
      const col = board.columns.find((c) => c.is_done);
      if (!col) return setBanner(`${board.name} has no done column.`);
      write = moveCardColumn(cardId, col.id, board.slug);
    } else if (card.status === "done") {
      const col = board.columns.find((c) => !c.is_done);
      if (!col) return setBanner(`${board.name} has no open column.`);
      write = moveCardColumn(cardId, col.id, board.slug);
    } else {
      write = setCardSprint(cardId, null, board.slug);
    }
    setPlacement((p) => ({ ...p, [cardId]: to }));
    setBanner(null);
    begin();
    write.then((r) => {
      if (!r.ok) setBanner(`Couldn't move card: ${r.error}`);
      end();
      router.refresh();
    });
  }

  const columns: KanbanColumn[] = PLANNING_COLUMNS.map((c) => ({ id: c.id, label: c.label, accent: ACCENT[c.id] }));

  return (
    <>
      <div className="admin-toolbar u-mb-3">
        {teams.length > 1 && (
          <select className="admin-select admin-input--w-sm" value={team} onChange={(e) => { setTeam(e.target.value as SprintChat); setClientFilter([]); }} aria-label="Team">
            {teams.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        )}
        {clients.length > 1 && <MultiSelect label="Filter by client" noun="clients" options={clients} value={clientFilter} onChange={setClientFilter} />}
        {weeks.length > 0 && (
          <select className="admin-select admin-input--w-sm" value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Sprint week">
            {weeks.map((w, i) => {
              const win = weekWindow(w);
              return (
                <option key={w} value={w}>
                  {weekShort(w)}
                  {win ? ` · ${formatDate(win.startsOn)} to ${formatDate(win.endsOn)}` : ""}
                  {i === 0 ? " (this week)" : ""}
                </option>
              );
            })}
          </select>
        )}
        <span className="admin-cell-muted u-sm u-ml-auto">{until ? `Done ${formatDate(since)} to ${formatDate(addDays(until, -1))}` : `Done since ${formatDate(since)}`}</span>
      </div>
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      <SprintPlanningNext boards={inView} cards={cards} section={section} canEdit={canEdit} saving={saving} run={run} />
      <KanbanBoard<Card>
        columns={columns}
        cards={cards}
        disabled={pending > 0 || !canEdit}
        onMove={move}
        renderCard={(c) => (
          <>
            <div className="admin-kanban-card-title">{c.title}</div>
            <div className="admin-kanban-card-meta">
              <Badge tone="info" colorIndex={c.pb.board.client_color}>{c.pb.board.client_name ?? "Internal"}</Badge>
              {(boardsPerClient.get(c.pb.board.client_company_id ?? "") ?? 0) > 1 && <span className="admin-kanban-card-sub">{c.pb.board.name}</span>}
              <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
              {isCarried(c, c.pb) && <Badge tone="warn">Carried from {sprintName.get(c.sprint_id ?? "") ?? "a past sprint"}</Badge>}
            </div>
            <div className="admin-kanban-card-meta">
              {c.assignee_name ? (
                <span className="admin-kanban-card-assignee"><span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(c.assignee_name)}</span>{c.assignee_name}</span>
              ) : (
                <span className="admin-kanban-card-sub">Unassigned</span>
              )}
              {c.human_tokens != null && <span className="admin-kanban-card-sub u-ml-auto" title="Human Tokens">⚡ {c.human_tokens} HT</span>}
            </div>
            {c.status === "done" && c.completed_at && <div className="admin-kanban-card-sub u-ok u-mt-1">✓ Completed {formatDate(c.completed_at)}</div>}
          </>
        )}
      />
    </>
  );
}
