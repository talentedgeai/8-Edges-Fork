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
  isDragDisabled,
  dragHandle = false,
  columnClassName,
  emptyLabel,
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
  // Per-card drag gate, for surfaces where the viewer may move only some cards
  // (a board member on the client hub moves their own cards, nobody else's).
  isDragDisabled?: (card: T) => boolean;
  // Drag by a visible grip rather than by the whole card. For cards whose
  // surface is mostly buttons and inputs (the coaching board: a title you
  // click to reword, a why-it-is-stuck field, a move menu), the library
  // refuses a drag that starts on an interactive element, so a whole-card
  // handle leaves almost nothing to grab. The grip is the one place that is
  // always draggable, and it says so.
  dragHandle?: boolean;
  // A per-column class, for a header that reacts to what just happened in it.
  columnClassName?: (column: KanbanColumn) => string | undefined;
  // What an empty column says; the default is the bare "No cards".
  emptyLabel?: (column: KanbanColumn) => string;
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
                <div className={`admin-kanban-col${snapshot.isDraggingOver ? " is-over" : ""}${columnClassName?.(col) ? ` ${columnClassName(col)}` : ""}`}>
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
                      <div className="admin-kanban-col-empty">{emptyLabel?.(col) ?? "No cards"}</div>
                    )}
                    {colCards.map((card, i) => (
                      <Draggable draggableId={card.id} index={i} key={card.id} isDragDisabled={!!disabled || !!isDragDisabled?.(card)}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...(dragHandle ? {} : dp.dragHandleProps)}
                            className={`admin-kanban-card${ds.isDragging ? " is-dragging" : ""}${dragHandle && !isDragDisabled?.(card) ? " has-grip" : ""}${cardClassName?.(card) ? ` ${cardClassName(card)}` : ""}`}
                            onClick={() => onCardClick?.(card)}
                          >
                            {dragHandle && !isDragDisabled?.(card) && (
                              <span
                                className="admin-kanban-grip"
                                {...dp.dragHandleProps}
                                aria-label="Drag to move"
                                title="Drag to move"
                              >
                                ⠿
                              </span>
                            )}
                            <div className="admin-kanban-card-inner">{renderCard(card)}</div>
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
