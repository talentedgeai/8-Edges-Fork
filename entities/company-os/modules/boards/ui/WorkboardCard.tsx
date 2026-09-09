"use client";

import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  AGING_DAYS,
  NEW_ASSIGNMENT_DAYS,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  SUBJECT_BACKLOG_ITEM,
  SUBJECT_COMMITMENT,
  assignedAt,
  cardBuildSummary,
  cardPrUrl,
  daysInColumn,
  epicColorIndex,
  initials,
} from "@/entities/company-os/modules/boards/types";
import type { EpicRow } from "@/entities/company-os/modules/boards/types";
import type { WorkboardBoard } from "@/entities/company-os/modules/boards/workboard";
import type { Card } from "./board-view-types";

// The one card design every workboard surface renders (WB-01). Where a chip
// does not apply it is simply absent; no surface gets a different layout.
export function isNewForViewer(c: Card, viewerPersonId: string | null | undefined): boolean {
  if (!viewerPersonId || c.assignee_id !== viewerPersonId || c.status === "done") return false;
  return Date.now() - new Date(assignedAt(c)).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
}

export function WorkboardCard({
  card: c,
  board,
  showBoard,
  viewerPersonId,
  sprintFilter,
  sprintName,
  epicById,
}: {
  card: Card;
  board: WorkboardBoard | undefined;
  // Many boards in scope: the card says which board and client it is on.
  showBoard: boolean;
  viewerPersonId: string | null | undefined;
  sprintFilter: string;
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
}) {
  const days = daysInColumn(c.last_moved_at);
  const aging = days >= AGING_DAYS && c.status !== "done";
  const overdue = c.due_date != null && c.status !== "done" && c.due_date < new Date().toISOString().slice(0, 10);
  const openBlockers = c.blockers.filter((b) => !b.resolved).length;
  const prUrl = cardPrUrl(c);
  const buildSummary = cardBuildSummary(c);
  const epic = c.epic_id ? epicById.get(c.epic_id) : undefined;
  const mine = !!viewerPersonId && c.assignee_id === viewerPersonId;
  return (
    <>
      <div className="admin-kanban-card-title">{c.title}</div>
      <div className="admin-kanban-card-meta">
        {isNewForViewer(c, viewerPersonId) && <Badge tone="info">New</Badge>}
        {mine && <Badge tone="ok">Mine</Badge>}
        <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
        {epic && (
          <span className="admin-board-epic-chip" title={`Epic: ${epic.name}`}>
            <span className="admin-board-epic-dot" data-epic-color={epicColorIndex(epic.color)} />
            {epic.name}
          </span>
        )}
        {c.subject_type === SUBJECT_COMMITMENT && <Badge tone="ok">Commitment</Badge>}
        {c.subject_type === SUBJECT_BACKLOG_ITEM && <Badge tone="info">Roadmap</Badge>}
        {c.agent && <Badge tone="neutral">Agent</Badge>}
        {c.sprint_id && c.sprint_id !== sprintFilter && sprintName.get(c.sprint_id) && (
          <Badge tone="info">{sprintName.get(c.sprint_id)}</Badge>
        )}
        {c.internal && <Badge tone="neutral">Internal</Badge>}
        {showBoard && (board?.client_name ? <Badge tone="info">{board.client_name}</Badge> : <Badge tone="neutral">Internal</Badge>)}
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
          <span className={`admin-kanban-card-sub u-ml-auto${overdue ? " u-err" : ""}`}>{formatDate(c.due_date)}</span>
        )}
      </div>
      {(showBoard || c.subtasks.length > 0 || openBlockers > 0 || c.comments.length > 0 || c.human_tokens != null || prUrl) && (
        <div className="admin-kanban-card-sub u-row u-gap-3 u-mt-1">
          {showBoard && board && <span>{board.name}</span>}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              title={prUrl}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              🔗 PR
            </a>
          )}
          {c.subtasks.length > 0 && (
            <span>
              ☑ {c.subtasks.filter((s) => s.done).length}/{c.subtasks.length}
            </span>
          )}
          {openBlockers > 0 && (
            <span className="u-err" title={`${openBlockers} unresolved blocker${openBlockers === 1 ? "" : "s"}`}>
              ⚠ {openBlockers}
            </span>
          )}
          {c.comments.length > 0 && <span>💬 {c.comments.length}</span>}
          {c.human_tokens != null && <span title="Human Tokens">⚡ {c.human_tokens} HT</span>}
        </div>
      )}
      {buildSummary && <div className="admin-kanban-card-sub u-muted u-mt-1 u-truncate">{buildSummary}</div>}
      {aging && <div className="admin-kanban-card-sub u-warn u-mt-1">◷ {days}d in column</div>}
    </>
  );
}
