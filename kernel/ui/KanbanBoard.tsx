"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { ReactNode } from "react";

export type KanbanColumn = { id: string; label: string; accent?: string };
export type KanbanCardBase = { id: string; columnId: string };

// Generic optimistic kanban. The parent owns card state and reconciliation; this
// only reports moves via onMove. Reusable for inquiries (status) and deals (stage).
export function KanbanBoard<T extends KanbanCardBase>({
  columns,
  cards,
  onMove,
  onReorder,
  onCardClick,
  renderCard,
  columnFooter,
  cardClassName,
  disabled,
}: {
  columns: KanbanColumn[];
  cards: T[];
  onMove: (cardId: string, toColumnId: string, toIndex?: number) => void;
  // Fired on a same-column drag (card stays in its column, just changes rank).
  // Optional — boards that don't track a within-column order can omit it.
  onReorder?: (cardId: string, columnId: string, toIndex: number) => void;
  onCardClick?: (card: T) => void;
  renderCard: (card: T) => ReactNode;
  columnFooter?: (column: KanbanColumn, cards: T[]) => ReactNode;
  cardClassName?: (card: T) => string | undefined;
  // Parents set this while a move is being written so a second drag cannot
  // start mid-flight and land on state the server is about to replace.
  disabled?: boolean;
}) {
  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) {
      if (destination.index === source.index) return;
      onReorder?.(draggableId, destination.droppableId, destination.index);
      return;
    }
    onMove(draggableId, destination.droppableId, destination.index);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="admin-kanban">
        {columns.map((col) => {
          const colCards = cards.filter((c) => c.columnId === col.id);
          return (
            <Droppable droppableId={col.id} key={col.id} isDropDisabled={!!disabled}>
              {(provided, snapshot) => (
                <div className={`admin-kanban-col${snapshot.isDraggingOver ? " is-over" : ""}`}>
                  <div className="admin-kanban-col-head">
                    <span
                      className="admin-kanban-col-dot"
                      style={col.accent ? { background: col.accent } : undefined}
                    />
                    <span className="admin-kanban-col-label">{col.label}</span>
                    <span className="admin-kanban-col-count">{colCards.length}</span>
                  </div>
                  {/* Droppable ref lives on the card list (not the whole column)
                      so the placeholder sizes it — this keeps an empty column a
                      full-height drop target instead of collapsing to nothing. */}
                  <div className="admin-kanban-col-body" ref={provided.innerRef} {...provided.droppableProps}>
                    {colCards.length === 0 && !snapshot.isDraggingOver && (
                      <div className="admin-kanban-col-empty">No cards</div>
                    )}
                    {colCards.map((card, i) => (
                      <Draggable draggableId={card.id} index={i} key={card.id} isDragDisabled={!!disabled}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...dp.dragHandleProps}
                            className={`admin-kanban-card${ds.isDragging ? " is-dragging" : ""}${cardClassName?.(card) ? ` ${cardClassName(card)}` : ""}`}
                            onClick={() => onCardClick?.(card)}
                          >
                            {renderCard(card)}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                  {columnFooter?.(col, colCards)}
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
