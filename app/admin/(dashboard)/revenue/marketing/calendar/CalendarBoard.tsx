"use client";

import { KanbanBoard, type KanbanColumn } from "@/components/admin/KanbanBoard";
import { Badge, statusTone } from "@/components/admin/Badge";
import {
  STATUSES,
  CHANNEL_LABEL,
  CHANNEL_ACCENT,
  type CalendarEntryRow,
} from "@/lib/admin/marketing-calendar";
import { formatDate } from "@/lib/admin/format";

const COLUMNS: KanbanColumn[] = STATUSES.map((s) => ({ id: s.id, label: s.label, accent: s.accent }));

type Card = CalendarEntryRow & { columnId: string };

export function CalendarBoard({
  entries,
  onMove,
  onCardClick,
}: {
  entries: CalendarEntryRow[];
  onMove: (id: string, status: string) => void;
  onCardClick: (id: string) => void;
}) {
  const cards: Card[] = entries.map((e) => ({ ...e, columnId: e.status }));
  const titleById = new Map(entries.map((e) => [e.id, e.title]));

  return (
    <KanbanBoard<Card>
      columns={COLUMNS}
      cards={cards}
      onMove={(id, toColumnId) => onMove(id, toColumnId)}
      onCardClick={(c) => onCardClick(c.id)}
      renderCard={(c) => (
        <>
          <div className="admin-kanban-card-title">{c.title}</div>
          {c.parentId && titleById.has(c.parentId) && (
            <div className="admin-kanban-card-sub">↳ from {titleById.get(c.parentId)}</div>
          )}
          <div className="admin-kanban-card-meta u-mt-2">
            <span
              className="admin-cal-chip admin-cal-chip--solid"
              style={{ background: CHANNEL_ACCENT[c.channel] }} /* layout-ok: channel accent is a token var chosen at runtime */
            >
              {CHANNEL_LABEL[c.channel]}
            </span>
            {c.brandName && <Badge>{c.brandName}</Badge>}
            {c.pillarName && <Badge tone="info">{c.pillarName}</Badge>}
            {c.broadcastStatus && <Badge tone={statusTone(c.broadcastStatus)}>{c.broadcastStatus}</Badge>}
            <span className="admin-kanban-card-sub u-ml-auto">
              {c.publishDate ? formatDate(c.publishDate) : "no date"}
            </span>
          </div>
        </>
      )}
    />
  );
}
