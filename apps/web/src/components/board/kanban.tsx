"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { cardsIn, sortedColumns, uuidv7, type BoardState, type Operation } from "@taskly/shared";
import { CardFace } from "./card-tile";
import { AddColumn, Column } from "./column";

type Order = Record<string, string[]>;
type Dragging = { type: "card" | "column"; id: string };

const kindOf = (data: { current?: Record<string, unknown> | undefined }) =>
  data.current?.["type"] as string | undefined;

/** Columns only collide with columns; cards prefer the card under the pointer, then the list it's in. */
const collisions: CollisionDetection = (args) => {
  const draggingColumn = kindOf(args.active.data) === "column";
  const droppableContainers = args.droppableContainers.filter(
    (c) => (kindOf(c.data) === "column") === draggingColumn,
  );
  const scoped = { ...args, droppableContainers };
  if (!draggingColumn) {
    const hits = pointerWithin(scoped);
    const cards = hits.filter(
      (hit) => kindOf(droppableContainers.find((c) => c.id === hit.id)!.data) === "card",
    );
    if (cards.length) return cards;
    if (hits.length) return hits;
  }
  return closestCenter(scoped);
};

/**
 * Keyboard moves. Up and down walk the column (dnd-kit's sortable behaviour); left and right jump to the
 * neighbouring column's list, which the default would miss (the nearest thing sideways is the column
 * itself, and cards don't collide with columns).
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, collisionRect, droppableRects, droppableContainers } = args.context;
  const sideways = event.code === "ArrowLeft" || event.code === "ArrowRight";
  if (!sideways || !active || kindOf(active.data) !== "card" || !collisionRect)
    return sortableKeyboardCoordinates(event, args);
  event.preventDefault();
  const center = collisionRect.left + collisionRect.width / 2;
  const lists = droppableContainers
    .getEnabled()
    .filter((container) => kindOf(container.data) === "list")
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [rect] : [];
    })
    .sort((a, b) => a.left - b.left);
  const target =
    event.code === "ArrowRight"
      ? lists.find((rect) => rect.left > center)
      : lists.findLast((rect) => rect.left + rect.width < center);
  return target ? { x: target.left + 8, y: target.top + 8 } : undefined;
};

export function Kanban({
  board,
  onOp,
  onOpenCard,
}: {
  board: BoardState;
  onOp: (op: Operation) => void;
  onOpenCard: (id: string) => void;
}) {
  const columns = useMemo(() => sortedColumns(board), [board]);
  const committed = useMemo<Order>(
    () => Object.fromEntries(columns.map((c) => [c.id, cardsIn(board, c.id).map((card) => card.id)])),
    [board, columns],
  );
  // While a card is dragged across columns, the arrangement shown is this preview; dropping turns it
  // into one card.move operation and the preview goes away.
  const [preview, setPreview] = useState<Order | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const order = preview ?? committed;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Enter is left free to open the card.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const columnOf = (id: UniqueIdentifier, within: Order): string | undefined => {
    const key = String(id);
    if (key.startsWith("list:")) return key.slice(5);
    if (within[key]) return key;
    return Object.keys(within).find((columnId) => within[columnId]!.includes(key));
  };

  const label = (id: UniqueIdentifier) => {
    const key = String(id);
    if (key.startsWith("list:")) return `a coluna ${board.columns[key.slice(5)]?.title ?? ""}`;
    return board.cards[key]?.title ?? board.columns[key]?.title ?? "item";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou ${label(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${label(active.id)} sobre ${label(over.id)}.` : `${label(active.id)} fora do quadro.`,
    onDragEnd: ({ active, over }) =>
      over ? `${label(active.id)} solto.` : `${label(active.id)} voltou para o lugar.`,
    onDragCancel: ({ active }) => `Movimento de ${label(active.id)} cancelado.`,
  };

  function onDragStart({ active }: DragStartEvent) {
    setDragging({ type: kindOf(active.data) === "column" ? "column" : "card", id: String(active.id) });
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || kindOf(active.data) !== "card") return;
    setPreview((previous) => {
      const current = previous ?? committed;
      const from = columnOf(active.id, current);
      const to = columnOf(over.id, current);
      if (!from || !to || from === to) return previous;
      const target = [...current[to]!];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...current, [from]: current[from]!.filter((id) => id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = preview ?? committed;
    setPreview(null);
    setDragging(null);
    const id = String(active.id);

    if (kindOf(active.data) === "column") {
      if (!over || over.id === active.id) return;
      const ids = columns.map((c) => c.id);
      const moved = arrayMove(ids, ids.indexOf(id), ids.indexOf(String(over.id)));
      const index = moved.indexOf(id);
      onOp({
        type: "column.move",
        columnId: id,
        afterId: moved[index - 1] ?? null,
        beforeId: moved[index + 1] ?? null,
      });
      return;
    }

    const card = board.cards[id];
    const to = columnOf(id, current);
    if (!card || !to || !over) return;
    let list = current[to]!;
    if (columnOf(over.id, current) === to && list.includes(String(over.id)) && over.id !== active.id) {
      list = arrayMove(list, list.indexOf(id), list.indexOf(String(over.id)));
    }
    const index = list.indexOf(id);
    const afterId = list[index - 1] ?? null;
    const beforeId = list[index + 1] ?? null;
    const before = committed[card.columnId]!;
    const was = before.indexOf(id);
    if (
      to === card.columnId &&
      (before[was - 1] ?? null) === afterId &&
      (before[was + 1] ?? null) === beforeId
    )
      return;
    onOp({ type: "card.move", cardId: id, toColumnId: to, afterId, beforeId });
  }

  const draggedCard = dragging?.type === "card" ? board.cards[dragging.id] : undefined;
  const draggedColumn = dragging?.type === "column" ? board.columns[dragging.id] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setPreview(null);
        setDragging(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mover, pressione espaço e use as setas; espaço de novo solta, Escape cancela. Enter abre o cartão.",
        },
      }}
    >
      <main className="flex flex-1 snap-x scroll-px-4 items-start gap-3 overflow-x-auto p-4">
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={(order[column.id] ?? []).map((id) => board.cards[id]!).filter(Boolean)}
              onOp={onOp}
              onOpenCard={onOpenCard}
            />
          ))}
        </SortableContext>
        <AddColumn
          onAdd={(title) =>
            onOp({ type: "column.create", columnId: uuidv7(), title, afterId: columns.at(-1)?.id ?? null })
          }
        />
      </main>
      <DragOverlay>
        {draggedCard ? (
          <div className="w-68">
            <CardFace card={draggedCard} lifted />
          </div>
        ) : draggedColumn ? (
          <div className="w-72 rounded-xl bg-zinc-200 p-3 text-sm font-semibold shadow-lg">
            {draggedColumn.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
