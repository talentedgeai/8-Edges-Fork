import { Badge } from "@/components/admin/Badge";
import { formatDate } from "@/lib/admin/format";
import { NEW_ASSIGNMENT_DAYS, PRIORITY_LABEL, PRIORITY_TONE, initials } from "@/lib/boards/types";
import {
  STAGE_WON,
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_PROPOSAL,
  STAGE_DISCOVERY,
  STAGE_CONTRACT,
} from "@/lib/admin/stageColors";
import type { ClientBoardColumn, ClientBoardCard } from "@/lib/boards/client-view";

// Only the columns + cards are rendered here, so accept any board shape that
// carries them (the full ClientBoardView, or the portal's narrower board data).
type BoardData = { columns: ClientBoardColumn[]; cards: ClientBoardCard[] };

// Read-only client-view kanban, exactly what the client sees on /portal/board.
// Shared by the team hub and the admin 360 hub. `viewerPersonId` marks the
// viewer's own cards; omit it where there is no personal assignment context.
const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];

export function ClientBoardView({
  board,
  viewerPersonId,
}: {
  board: BoardData;
  viewerPersonId?: string | null;
}) {
  let nd = 0;
  const accents = board.columns.map((c) => (c.isDone ? STAGE_WON : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length]));

  return (
    <div className="admin-kanban-kanban">
      {board.columns.map((col, i) => {
        const colCards = board.cards.filter((c) => c.columnId === col.id);
        return (
          <div className="admin-kanban-col" key={col.id}>
            <div className="admin-kanban-col-head">
              <span className="admin-kanban-col-dot" style={{ background: accents[i] }} /* layout-ok: column accent is a token var chosen at runtime */ />
              <span className="admin-kanban-col-label">{col.name}</span>
              <span className="admin-kanban-col-count">{colCards.length}</span>
            </div>
            <div className="admin-kanban-col-body">
              {colCards.map((c) => {
                const isNew = !c.done && Date.now() - new Date(c.createdAt).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
                const who = c.assigneeName ?? "Edge8";
                const mine = !!viewerPersonId && c.assigneeId === viewerPersonId;
                return (
                  <div className="admin-kanban-card admin-kanban-card--static" key={c.id}>
                    <div className="admin-kanban-card-title">{c.title}</div>
                    <div className="admin-kanban-card-meta">
                      {isNew && <Badge tone="info">New</Badge>}
                      {mine && <Badge tone="ok">Mine</Badge>}
                      <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
                      {c.sprintName && <Badge tone="info">{c.sprintName}</Badge>}
                    </div>
                    <div className="admin-kanban-card-meta">
                      <span className="admin-kanban-card-assignee">
                        <span className="admin-kanban-avatar">{initials(who)}</span>
                        {who}
                      </span>
                      {c.dueDate && (
                        <span className="admin-kanban-card-sub u-ml-auto">
                          {formatDate(c.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {colCards.length === 0 && <div className="admin-kanban-col-empty">No cards</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
